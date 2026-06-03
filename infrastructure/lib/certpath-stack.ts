import * as cdk          from 'aws-cdk-lib'
import { Construct }     from 'constructs'
import * as s3           from 'aws-cdk-lib/aws-s3'
import * as s3deploy     from 'aws-cdk-lib/aws-s3-deployment'
import * as cognito      from 'aws-cdk-lib/aws-cognito'
import * as acm          from 'aws-cdk-lib/aws-certificatemanager'
import * as lambda       from 'aws-cdk-lib/aws-lambda'
import * as apigw        from 'aws-cdk-lib/aws-apigateway'
import * as dynamodb     from 'aws-cdk-lib/aws-dynamodb'
import * as sfn          from 'aws-cdk-lib/aws-stepfunctions'
import * as tasks        from 'aws-cdk-lib/aws-stepfunctions-tasks'
import * as events       from 'aws-cdk-lib/aws-events'
import * as eventTargets from 'aws-cdk-lib/aws-events-targets'
import * as iam          from 'aws-cdk-lib/aws-iam'
import * as cloudfront         from 'aws-cdk-lib/aws-cloudfront'
import * as cr                 from 'aws-cdk-lib/custom-resources'
import * as ssm                from 'aws-cdk-lib/aws-ssm'
import * as sqs                from 'aws-cdk-lib/aws-sqs'
import * as sns                from 'aws-cdk-lib/aws-sns'
import * as snsSubscriptions   from 'aws-cdk-lib/aws-sns-subscriptions'
import * as cloudwatch         from 'aws-cdk-lib/aws-cloudwatch'
import * as cloudwatchActions  from 'aws-cdk-lib/aws-cloudwatch-actions'
import * as logs               from 'aws-cdk-lib/aws-logs'
import * as path               from 'path'

// The existing CloudFront distribution serving esaheki.com.
// Managed by a separate CDK stack — we add a /aws* behavior via Custom Resource.
const EXISTING_DISTRIBUTION_ID = 'EMKYH9HKL6ZLM'

export class CertpathStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // ── DynamoDB tables ───────────────────────────────────────────────────────

    // certpath-profiles was retained from a prior deploy — import it
    const profilesTable = dynamodb.Table.fromTableName(this, 'ProfilesTable', 'certpath-profiles')

    const examGuidesTable = new dynamodb.Table(this, 'ExamGuidesTable', {
      tableName: 'certpath-examguides',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    const executionsTable = new dynamodb.Table(this, 'ExecutionsTable', {
      tableName: 'certpath-executions',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    // ── Cognito User Pool ─────────────────────────────────────────────────────

    // certpath-users was retained from a prior deploy — import it
    const userPool = cognito.UserPool.fromUserPoolId(this, 'UserPool', 'us-east-1_8O7WAg33C')

    // ── Google IdP ────────────────────────────────────────────────────────────

    const googleClientId     = ssm.StringParameter.valueForStringParameter(this, '/certpath/google-client-id')
    const googleClientSecret = ssm.StringParameter.valueForStringParameter(this, '/certpath/google-client-secret')

    const googleIdP = new cognito.CfnUserPoolIdentityProvider(this, 'GoogleIdP', {
      userPoolId: userPool.userPoolId,
      providerName: 'Google',
      providerType: 'Google',
      providerDetails: {
        client_id: googleClientId,
        client_secret: googleClientSecret,
        authorize_scopes: 'openid email profile',
      },
      attributeMapping: {
        email: 'email',
        name: 'name',
        picture: 'picture',
        username: 'sub',
      },
    })

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      generateSecret: false,
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.GOOGLE,
        cognito.UserPoolClientIdentityProvider.COGNITO,
      ],
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: ['https://esaheki.com/aws', 'http://localhost:5173/callback'],
        logoutUrls:   ['https://esaheki.com/aws', 'http://localhost:5173'],
      },
    })
    userPoolClient.node.addDependency(googleIdP)

    // ACM cert for custom Cognito domain — must be in us-east-1 (Cognito requirement).
    // CDK will pause deployment and print the DNS validation CNAME to add in your DNS provider.
    const cognitoAuthCert = new acm.Certificate(this, 'CognitoAuthCert', {
      domainName: 'auth.esaheki.com',
      validation: acm.CertificateValidation.fromDns(),
    })

    const userPoolDomain = new cognito.UserPoolDomain(this, 'UserPoolDomain', {
      userPool,
      customDomain: {
        domainName: 'auth.esaheki.com',
        certificate: cognitoAuthCert,
      },
    })

    // ── Bedrock IAM policy (reusable) ────────────────────────────────────────

    // Cross-region inference profiles (us.*) route calls across us-east-1, us-east-2,
    // and us-west-2 based on capacity, so foundation-model ARNs need a region wildcard.
    const bedrockPolicy = new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [
        // Foundation models — region wildcard required for cross-region inference routing
        `arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku*`,
        `arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet*`,
        // Cross-region inference profiles — account-scoped, region where profile is registered
        `arn:aws:bedrock:*:${this.account}:inference-profile/us.anthropic.claude-haiku*`,
        `arn:aws:bedrock:*:${this.account}:inference-profile/us.anthropic.claude-sonnet*`,
      ],
    })

    // ── Lambda: analyze-classify ─────────────────────────────────────────────

    const classifyFn = new lambda.Function(this, 'AnalyzeClassify', {
      functionName: 'certpath-analyze-classify',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/functions/analyze-classify')),
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      tracing: lambda.Tracing.ACTIVE,
      environment: { EXECUTIONS_TABLE: executionsTable.tableName },
    })
    classifyFn.addToRolePolicy(bedrockPolicy)
    executionsTable.grantWriteData(classifyFn)

    // ── Lambda: analyze-fetch-docs ───────────────────────────────────────────

    const fetchDocsFn = new lambda.Function(this, 'AnalyzeFetchDocs', {
      functionName: 'certpath-analyze-fetch-docs',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/functions/analyze-fetch-docs')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        EXAM_GUIDES_TABLE: examGuidesTable.tableName,
        EXECUTIONS_TABLE:  executionsTable.tableName,
      },
    })
    examGuidesTable.grantReadData(fetchDocsFn)
    executionsTable.grantWriteData(fetchDocsFn)

    // ── Lambda: analyze-final ────────────────────────────────────────────────

    const finalFn = new lambda.Function(this, 'AnalyzeFinal', {
      functionName: 'certpath-analyze-final',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/functions/analyze-final')),
      timeout: cdk.Duration.seconds(180),
      memorySize: 512,
      tracing: lambda.Tracing.ACTIVE,
      environment: { EXECUTIONS_TABLE: executionsTable.tableName },
    })
    finalFn.addToRolePolicy(bedrockPolicy)
    executionsTable.grantWriteData(finalFn)

    // ── Step Functions state machine ─────────────────────────────────────────

    const classifyTask = new tasks.LambdaInvoke(this, 'ClassifyCert', {
      lambdaFunction: classifyFn,
      outputPath: '$.Payload',
    })
    classifyTask.addRetry({ errors: ['States.ALL'], maxAttempts: 3, interval: cdk.Duration.seconds(2), backoffRate: 2 })

    const fetchDocsTask = new tasks.LambdaInvoke(this, 'FetchDocs', {
      lambdaFunction: fetchDocsFn,
      outputPath: '$.Payload',
    })
    fetchDocsTask.addRetry({ errors: ['States.ALL'], maxAttempts: 3, interval: cdk.Duration.seconds(2), backoffRate: 2 })

    const finalTask = new tasks.LambdaInvoke(this, 'FinalAnalysis', {
      lambdaFunction: finalFn,
      outputPath: '$.Payload',
    })
    finalTask.addRetry({ errors: ['States.ALL'], maxAttempts: 3, interval: cdk.Duration.seconds(2), backoffRate: 2 })

    // Catch handler: write a user-friendly FAILED status to DynamoDB, then fail the SM.
    // Runs only after a step exhausts all retries — avoids users seeing a permanent spinner.
    const writeFailedStatus = new tasks.DynamoUpdateItem(this, 'WriteFailedStatus', {
      table: executionsTable,
      key: { pk: tasks.DynamoAttributeValue.fromString(sfn.JsonPath.stringAt('$.executionId')) },
      updateExpression: 'SET #s = :status, currentStep = :step',
      expressionAttributeNames: { '#s': 'status' },
      expressionAttributeValues: {
        ':status': tasks.DynamoAttributeValue.fromString('FAILED'),
        ':step':   tasks.DynamoAttributeValue.fromString('Analysis failed. Please try again.'),
      },
      resultPath: sfn.JsonPath.DISCARD,
    })
    writeFailedStatus.next(new sfn.Fail(this, 'AnalysisFailed', {
      error: 'AnalysisFailed',
      cause: 'Pipeline step failed after max retries',
    }))

    const catchOpts = { errors: ['States.ALL'], resultPath: '$.error' }
    classifyTask.addCatch(writeFailedStatus, catchOpts)
    fetchDocsTask.addCatch(writeFailedStatus, catchOpts)
    finalTask.addCatch(writeFailedStatus, catchOpts)

    const stateMachine = new sfn.StateMachine(this, 'CertpathStateMachine', {
      stateMachineName: 'certpath-analysis',
      definitionBody: sfn.DefinitionBody.fromChainable(
        classifyTask.next(fetchDocsTask).next(finalTask)
      ),
      stateMachineType: sfn.StateMachineType.STANDARD,
    })

    // ── Lambda: analyze-start ────────────────────────────────────────────────

    const analyzeStartFn = new lambda.Function(this, 'AnalyzeStart', {
      functionName: 'certpath-analyze-start',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/functions/analyze-start')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        STATE_MACHINE_ARN: stateMachine.stateMachineArn,
        EXECUTIONS_TABLE:  executionsTable.tableName,
        PROFILES_TABLE:    profilesTable.tableName,
      },
    })
    stateMachine.grantStartExecution(analyzeStartFn)
    executionsTable.grantWriteData(analyzeStartFn)
    profilesTable.grantReadData(analyzeStartFn)
    profilesTable.grantWriteData(analyzeStartFn)

    // ── Lambda: analyze-status ───────────────────────────────────────────────

    const analyzeStatusFn = new lambda.Function(this, 'AnalyzeStatus', {
      functionName: 'certpath-analyze-status',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/functions/analyze-status')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      tracing: lambda.Tracing.ACTIVE,
      environment: { EXECUTIONS_TABLE: executionsTable.tableName },
    })
    executionsTable.grantReadData(analyzeStatusFn)

    // ── Lambda: step-tracker ─────────────────────────────────────────────────

    const stepTrackerFn = new lambda.Function(this, 'StepTracker', {
      functionName: 'certpath-step-tracker',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/functions/step-tracker')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      tracing: lambda.Tracing.ACTIVE,
      environment: { EXECUTIONS_TABLE: executionsTable.tableName },
    })
    executionsTable.grantWriteData(stepTrackerFn)

    // ── Lambda: populate-exam-guides ─────────────────────────────────────────

    const populateExamGuidesFn = new lambda.Function(this, 'PopulateExamGuides', {
      functionName: 'certpath-populate-exam-guides',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/functions/populate-exam-guides')),
      timeout: cdk.Duration.seconds(300),
      memorySize: 256,
      tracing: lambda.Tracing.ACTIVE,
      environment: { EXAM_GUIDES_TABLE: examGuidesTable.tableName },
    })
    populateExamGuidesFn.addToRolePolicy(bedrockPolicy)
    examGuidesTable.grantWriteData(populateExamGuidesFn)

    // ── EventBridge DLQ — catches failed invocations from both rules ─────────

    const eventBridgeDlq = new sqs.Queue(this, 'EventBridgeDlq', {
      queueName: 'certpath-eventbridge-dlq',
      retentionPeriod: cdk.Duration.days(14),
    })

    // ── EventBridge: SF state changes → step-tracker ─────────────────────────

    const sfEventRule = new events.Rule(this, 'SFExecutionStateChange', {
      eventPattern: {
        source: ['aws.states'],
        detailType: ['Step Functions Execution Status Change'],
        detail: { stateMachineArn: [stateMachine.stateMachineArn] },
      },
    })
    sfEventRule.addTarget(new eventTargets.LambdaFunction(stepTrackerFn, {
      deadLetterQueue: eventBridgeDlq,
    }))

    // ── EventBridge: monthly cron → populate-exam-guides ─────────────────────

    const cronRule = new events.Rule(this, 'MonthlyExamGuideRefresh', {
      schedule: events.Schedule.cron({ minute: '0', hour: '0', day: '1', month: '*', year: '*' }),
    })
    cronRule.addTarget(new eventTargets.LambdaFunction(populateExamGuidesFn, {
      deadLetterQueue: eventBridgeDlq,
    }))

    // ── API Gateway ───────────────────────────────────────────────────────────

    const api = new apigw.RestApi(this, 'CertpathApi', {
      restApiName: 'certpath-api',
      defaultCorsPreflightOptions: {
        allowOrigins: ['https://esaheki.com', 'http://localhost:5173'],
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    })

    const authorizer = new apigw.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [userPool],
    })

    const analyzeRoute = api.root.addResource('analyze')
    analyzeRoute.addMethod('POST', new apigw.LambdaIntegration(analyzeStartFn), {
      authorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    })

    const executionRoute = analyzeRoute.addResource('{executionId}')
    executionRoute.addMethod('GET', new apigw.LambdaIntegration(analyzeStatusFn), {
      authorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    })

    // ── Lambda: profile-get ──────────────────────────────────────────────────

    const profileGetFn = new lambda.Function(this, 'ProfileGet', {
      functionName: 'certpath-profile-get',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/functions/profile-get')),
      timeout: cdk.Duration.seconds(15),
      memorySize: 128,
      tracing: lambda.Tracing.ACTIVE,
      environment: { PROFILES_TABLE: profilesTable.tableName },
    })
    profilesTable.grantReadData(profileGetFn)

    // ── Lambda: profile-save ─────────────────────────────────────────────────

    const profileSaveFn = new lambda.Function(this, 'ProfileSave', {
      functionName: 'certpath-profile-save',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/functions/profile-save')),
      timeout: cdk.Duration.seconds(15),
      memorySize: 128,
      tracing: lambda.Tracing.ACTIVE,
      environment: { PROFILES_TABLE: profilesTable.tableName },
    })
    profilesTable.grantWriteData(profileSaveFn)

    const profileRoute = api.root.addResource('profile')
    profileRoute.addMethod('GET', new apigw.LambdaIntegration(profileGetFn), {
      authorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    })
    profileRoute.addMethod('POST', new apigw.LambdaIntegration(profileSaveFn), {
      authorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    })

    // ── S3: frontend static hosting ───────────────────────────────────────────

    const bucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `certpath-frontend-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    // Allow the existing esaheki.com CloudFront distribution to read aws/* objects
    bucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [bucket.arnForObjects('aws/*')],
      principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
      conditions: {
        StringEquals: {
          'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${EXISTING_DISTRIBUTION_ID}`,
        },
      },
    }))

    // ── Origin Access Control ─────────────────────────────────────────────────

    const oac = new cloudfront.CfnOriginAccessControl(this, 'CertpathOAC', {
      originAccessControlConfig: {
        name: 'certpath-oac',
        originAccessControlOriginType: 's3',
        signingBehavior: 'always',
        signingProtocol: 'sigv4',
        description: 'OAC for CertPath S3 bucket',
      },
    })

    // ── Custom Resource: add /aws* behavior to existing distribution ──────────

    const updateDistFn = new lambda.Function(this, 'UpdateDistFunction', {
      functionName: 'certpath-update-distribution',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/functions/update-distribution')),
      timeout: cdk.Duration.seconds(300),
      memorySize: 256,
      tracing: lambda.Tracing.ACTIVE,
    })

    const distributionArn = `arn:aws:cloudfront::${this.account}:distribution/${EXISTING_DISTRIBUTION_ID}`
    const cfFunctionArn   = `arn:aws:cloudfront::${this.account}:function/certpath-spa-routing`

    updateDistFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudfront:GetDistributionConfig', 'cloudfront:UpdateDistribution'],
      resources: [distributionArn],
    }))
    updateDistFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cloudfront:CreateFunction',
        'cloudfront:PublishFunction',
        'cloudfront:DeleteFunction',
        'cloudfront:DescribeFunction',
      ],
      resources: [cfFunctionArn],
    }))

    const updateDistProvider = new cr.Provider(this, 'UpdateDistProvider', {
      onEventHandler: updateDistFn,
    })

    new cdk.CustomResource(this, 'AddCertpathBehavior', {
      serviceToken: updateDistProvider.serviceToken,
      properties: {
        DistributionId:  EXISTING_DISTRIBUTION_ID,
        BucketDomain:    bucket.bucketRegionalDomainName,
        OacId:           oac.attrId,
        FunctionName:    'certpath-spa-routing',
        // Increment to force re-run on redeploy
        Version:         '1',
      },
    })

    // ── Frontend deployment ───────────────────────────────────────────────────

    // Hashed JS/CSS bundles — content-addressed by Vite, safe to cache for 1 year
    new s3deploy.BucketDeployment(this, 'DeployAssets', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../dist/assets'))],
      destinationBucket: bucket,
      destinationKeyPrefix: 'aws/assets',
      cacheControl: [
        s3deploy.CacheControl.maxAge(cdk.Duration.days(365)),
        s3deploy.CacheControl.fromString('immutable'),
      ],
      prune: false,
    })

    // index.html and non-hashed public files — must revalidate on every load
    new s3deploy.BucketDeployment(this, 'DeployHtml', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../dist'), {
        exclude: ['assets'],
      })],
      destinationBucket: bucket,
      destinationKeyPrefix: 'aws',
      cacheControl: [s3deploy.CacheControl.noCache()],
      prune: false,
    })

    // ── CloudWatch alarms ─────────────────────────────────────────────────────

    const alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: 'certpath-alarms',
    })
    alarmTopic.addSubscription(new snsSubscriptions.EmailSubscription('esaheki@gmail.com'))

    const alarmAction = new cloudwatchActions.SnsAction(alarmTopic)

    const addAlarm = (alarm: cloudwatch.Alarm) => {
      alarm.addAlarmAction(alarmAction)
      alarm.addOkAction(alarmAction)
      return alarm
    }

    // 1. populate-exam-guides Lambda errors (evaluated once a day — function runs monthly)
    addAlarm(new cloudwatch.Alarm(this, 'PopulateExamGuidesErrors', {
      alarmName: 'certpath-populate-exam-guides-errors',
      alarmDescription: 'populate-exam-guides had Lambda errors — exam guide cache may be stale for affected certs',
      metric: populateExamGuidesFn.metricErrors({ period: cdk.Duration.days(1), statistic: 'Sum' }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }))

    // 2. Step Functions execution failures
    addAlarm(new cloudwatch.Alarm(this, 'AnalysisExecutionsFailed', {
      alarmName: 'certpath-analysis-executions-failed',
      alarmDescription: 'certpath-analysis Step Functions execution failed — users are seeing errors',
      metric: stateMachine.metricFailed({ period: cdk.Duration.minutes(5), statistic: 'Sum' }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }))

    // 3. API Gateway 5xx errors
    addAlarm(new cloudwatch.Alarm(this, 'ApiGateway5xx', {
      alarmName: 'certpath-api-5xx',
      alarmDescription: 'certpath-api has elevated 5xx errors',
      metric: api.metricServerError({ period: cdk.Duration.minutes(5), statistic: 'Sum' }),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }))

    // 4. EventBridge DLQ depth (step-tracker or populate-exam-guides invocations silently failing)
    addAlarm(new cloudwatch.Alarm(this, 'EventBridgeDlqDepth', {
      alarmName: 'certpath-eventbridge-dlq-depth',
      alarmDescription: 'EventBridge DLQ has messages — step-tracker or populate-exam-guides invocations are being dropped',
      metric: eventBridgeDlq.metricApproximateNumberOfMessagesVisible({
        period: cdk.Duration.minutes(5),
        statistic: 'Maximum',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }))

    // ── Bedrock metric filters ────────────────────────────────────────────────

    const bedrockNs = 'CertPath/Bedrock'
    const usagePattern = logs.FilterPattern.stringValue('$.message', '=', 'Bedrock usage')

    const classifyLg = logs.LogGroup.fromLogGroupName(this, 'ClassifyLg', '/aws/lambda/certpath-analyze-classify')
    const finalLg    = logs.LogGroup.fromLogGroupName(this, 'FinalLg',    '/aws/lambda/certpath-analyze-final')
    const populateLg = logs.LogGroup.fromLogGroupName(this, 'PopulateLg', '/aws/lambda/certpath-populate-exam-guides')

    const mkFilter = (id: string, lg: logs.ILogGroup, metricName: string, field: string) =>
      new logs.MetricFilter(this, id, {
        logGroup: lg,
        filterPattern: usagePattern,
        metricNamespace: bedrockNs,
        metricName,
        metricValue: field,
        defaultValue: 0,
      })

    mkFilter('ClassifyInputTokens',  classifyLg, 'ClassifyInputTokens',  '$.inputTokens')
    mkFilter('ClassifyOutputTokens', classifyLg, 'ClassifyOutputTokens', '$.outputTokens')
    mkFilter('FinalInputTokens',     finalLg,    'FinalInputTokens',     '$.inputTokens')
    mkFilter('FinalOutputTokens',    finalLg,    'FinalOutputTokens',    '$.outputTokens')
    mkFilter('FinalCacheReadTokens', finalLg,    'FinalCacheReadTokens', '$.cacheReadInputTokens')
    mkFilter('FinalCacheWriteTokens',finalLg,    'FinalCacheWriteTokens','$.cacheWriteInputTokens')
    mkFilter('PopulateInputTokens',  populateLg, 'PopulateInputTokens',  '$.inputTokens')
    mkFilter('PopulateOutputTokens', populateLg, 'PopulateOutputTokens', '$.outputTokens')

    // ── CloudWatch dashboard ──────────────────────────────────────────────────

    const p1h  = cdk.Duration.hours(1)
    const p30d = cdk.Duration.days(30)

    const bm = (metricName: string, period: cdk.Duration, label: string) =>
      new cloudwatch.Metric({ namespace: bedrockNs, metricName, statistic: 'Sum', period, label })

    // Hourly token metrics (for graphs)
    const classifyIn  = bm('ClassifyInputTokens',  p1h, 'Input (Haiku classify)')
    const classifyOut = bm('ClassifyOutputTokens', p1h, 'Output (Haiku classify)')
    const finalIn     = bm('FinalInputTokens',     p1h, 'Input (Sonnet final)')
    const finalOut    = bm('FinalOutputTokens',    p1h, 'Output (Sonnet final)')
    const finalCacheR = bm('FinalCacheReadTokens', p1h, 'Cache read (Sonnet)')
    const finalCacheW = bm('FinalCacheWriteTokens',p1h, 'Cache write (Sonnet)')

    // Estimated cost per hour — metric math
    const classifyCostH = new cloudwatch.MathExpression({
      expression: 'cIn*0.0000008 + cOut*0.000004',
      usingMetrics: { cIn: classifyIn, cOut: classifyOut },
      label: 'Classify cost (USD)',
      period: p1h,
    })
    const finalCostH = new cloudwatch.MathExpression({
      expression: '(fIn-fCR)*0.000003 + fOut*0.000015 + fCR*0.0000003 + fCW*0.000003375',
      usingMetrics: { fIn: finalIn, fOut: finalOut, fCR: finalCacheR, fCW: finalCacheW },
      label: 'Final analysis cost (USD)',
      period: p1h,
    })

    // Cache hit rate — metric math
    const cacheHitPct = new cloudwatch.MathExpression({
      expression: 'IF(fIn > 0, 100 * fCR / fIn, 0)',
      usingMetrics: { fIn: finalIn, fCR: finalCacheR },
      label: 'Cache hit rate (%)',
      period: p1h,
    })

    // 30-day rolling totals for single-value widgets
    const monthlyCost = new cloudwatch.MathExpression({
      expression: '(cIn*0.0000008 + cOut*0.000004) + ((fIn-fCR)*0.000003 + fOut*0.000015 + fCR*0.0000003 + fCW*0.000003375)',
      usingMetrics: {
        cIn:  bm('ClassifyInputTokens',  p30d, ''),
        cOut: bm('ClassifyOutputTokens', p30d, ''),
        fIn:  bm('FinalInputTokens',     p30d, ''),
        fOut: bm('FinalOutputTokens',    p30d, ''),
        fCR:  bm('FinalCacheReadTokens', p30d, ''),
        fCW:  bm('FinalCacheWriteTokens',p30d, ''),
      },
      label: 'Est. monthly cost (USD)',
      period: p30d,
    })
    const monthlyCacheTokensSaved = bm('FinalCacheReadTokens', p30d, 'Cache tokens saved (30d)')

    const dashboard = new cloudwatch.Dashboard(this, 'CertpathDashboard', {
      dashboardName: 'certpath',
      defaultInterval: cdk.Duration.days(7),
    })

    // Row 1 — Analysis activity
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Analysis Executions',
        width: 12, height: 6,
        left: [
          stateMachine.metric('ExecutionsStarted', { statistic: 'Sum', period: p1h, label: 'Started' }),
          stateMachine.metricSucceeded({ statistic: 'Sum', period: p1h, label: 'Succeeded' }),
          stateMachine.metricFailed({ statistic: 'Sum', period: p1h, label: 'Failed' }),
          stateMachine.metricTimedOut({ statistic: 'Sum', period: p1h, label: 'Timed out' }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway Requests',
        width: 12, height: 6,
        left: [api.metricCount({ statistic: 'Sum', period: p1h, label: 'Total' })],
        right: [
          api.metricServerError({ statistic: 'Sum', period: p1h, label: '5xx' }),
          api.metricClientError({ statistic: 'Sum', period: p1h, label: '4xx' }),
        ],
      }),
    )

    // Row 2 — Token consumption
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Classify Tokens / hr  (Haiku)',
        width: 12, height: 6,
        left: [classifyIn, classifyOut],
      }),
      new cloudwatch.GraphWidget({
        title: 'Final Analysis Tokens / hr  (Sonnet)',
        width: 12, height: 6,
        left: [finalIn, finalOut, finalCacheR, finalCacheW],
      }),
    )

    // Row 3 — Cache effectiveness
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Prompt Cache Hit Rate — Sonnet',
        width: 12, height: 6,
        left: [cacheHitPct],
        leftYAxis: { min: 0, max: 100, label: '%', showUnits: false },
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Cache Tokens Saved (30-day rolling)',
        width: 12, height: 6,
        metrics: [monthlyCacheTokensSaved],
        fullPrecision: false,
      }),
    )

    // Row 4 — Estimated cost
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Estimated Bedrock Cost / hr  (USD)',
        width: 12, height: 6,
        left: [classifyCostH, finalCostH],
        stacked: true,
        leftYAxis: { label: 'USD', showUnits: false },
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Estimated Monthly Cost — 30-day rolling  (USD)',
        width: 12, height: 6,
        metrics: [monthlyCost],
        fullPrecision: true,
      }),
    )

    // Row 5 — Average cost per analysis
    // Fresh metric instances avoid CDK ID conflicts with metrics already bound to Row 4 expressions.
    const avgCostExpr = (period: cdk.Duration, label: string) => new cloudwatch.MathExpression({
      expression: 'IF(execs > 0, (cIn*0.0000008 + cOut*0.000004 + (fIn-fCR)*0.000003 + fOut*0.000015 + fCR*0.0000003 + fCW*0.000003375) / execs, 0)',
      usingMetrics: {
        execs: stateMachine.metric('ExecutionsStarted', { statistic: 'Sum', period }),
        cIn:  new cloudwatch.Metric({ namespace: bedrockNs, metricName: 'ClassifyInputTokens',  statistic: 'Sum', period }),
        cOut: new cloudwatch.Metric({ namespace: bedrockNs, metricName: 'ClassifyOutputTokens', statistic: 'Sum', period }),
        fIn:  new cloudwatch.Metric({ namespace: bedrockNs, metricName: 'FinalInputTokens',     statistic: 'Sum', period }),
        fOut: new cloudwatch.Metric({ namespace: bedrockNs, metricName: 'FinalOutputTokens',    statistic: 'Sum', period }),
        fCR:  new cloudwatch.Metric({ namespace: bedrockNs, metricName: 'FinalCacheReadTokens', statistic: 'Sum', period }),
        fCW:  new cloudwatch.Metric({ namespace: bedrockNs, metricName: 'FinalCacheWriteTokens',statistic: 'Sum', period }),
      },
      label,
      period,
    })

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Average Cost per Analysis / hr  (USD)',
        width: 12, height: 6,
        left: [avgCostExpr(p1h, 'Avg cost per analysis (USD)')],
        leftYAxis: { label: 'USD', showUnits: false },
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Average Cost per Analysis — 30-day rolling  (USD)',
        width: 12, height: 6,
        metrics: [avgCostExpr(p30d, 'Avg cost per analysis (30d, USD)')],
        fullPrecision: true,
      }),
    )

    // ── Outputs ───────────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'SiteUrl',          { value: 'https://esaheki.com/aws' })
    new cdk.CfnOutput(this, 'ApiGatewayURL',    { value: api.url })
    new cdk.CfnOutput(this, 'UserPoolId',       { value: userPool.userPoolId })
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId })
    new cdk.CfnOutput(this, 'CognitoAuthDomain',      { value: 'auth.esaheki.com' })
    new cdk.CfnOutput(this, 'CognitoCloudFrontAlias', { value: userPoolDomain.cloudFrontDomainName, description: 'Add CNAME: auth.esaheki.com → this value' })
    new cdk.CfnOutput(this, 'StateMachineArn',  { value: stateMachine.stateMachineArn })
    new cdk.CfnOutput(this, 'FrontendBucketName', { value: bucket.bucketName })
  }
}
