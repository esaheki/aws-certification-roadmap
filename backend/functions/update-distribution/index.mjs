/**
 * CloudFormation Custom Resource Lambda
 *
 * Adds (or removes on stack delete) a /aws* CloudFront behavior and a
 * CloudFront Function for SPA path rewriting to an existing distribution
 * that is owned by a different CDK stack.
 *
 * Properties:
 *   DistributionId  - existing CloudFront distribution ID
 *   BucketDomain    - regional domain of the CertPath S3 bucket
 *   OacId           - OAC ID to attach to the new S3 origin
 *   FunctionName    - name to use for the CloudFront Function
 */

import {
  CloudFrontClient,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
  CreateFunctionCommand,
  PublishFunctionCommand,
  DeleteFunctionCommand,
  DescribeFunctionCommand,
} from '@aws-sdk/client-cloudfront'

const cf = new CloudFrontClient({ region: 'us-east-1' })

const ORIGIN_ID = 'CertpathS3Origin'
const PATH_PATTERN = '/aws*'
// CachingOptimized managed cache policy
const CACHE_POLICY_ID = '658327ea-f89d-4fab-a63d-7e88639e58f6'

const FUNCTION_CODE = `function handler(event) {
  var uri = event.request.uri;
  if (uri === '/aws' || uri === '/aws/') {
    event.request.uri = '/aws/index.html';
  }
  return event.request;
}`

export const handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2))
  const { RequestType, ResourceProperties: p, PhysicalResourceId } = event

  try {
    if (RequestType === 'Delete') {
      await removeBehavior(p.DistributionId, p.FunctionName)
      return { PhysicalResourceId }
    }

    const fnArn = await upsertFunction(p.FunctionName)
    await upsertBehavior(p.DistributionId, p.BucketDomain, p.OacId, fnArn)

    return { PhysicalResourceId: `${p.DistributionId}-certpath` }
  } catch (e) {
    console.error('Custom resource error:', e)
    throw e
  }
}

async function upsertFunction(name) {
  try {
    const created = await cf.send(new CreateFunctionCommand({
      Name: name,
      FunctionConfig: {
        Comment: 'CertPath SPA path rewriting',
        Runtime: 'cloudfront-js-2.0',
      },
      FunctionCode: Buffer.from(FUNCTION_CODE),
    }))
    const pub = await cf.send(new PublishFunctionCommand({
      Name: name,
      IfMatch: created.ETag,
    }))
    console.log('Created CloudFront Function:', name)
    return pub.FunctionSummary.FunctionMetadata.FunctionARN
  } catch (e) {
    if (e.name !== 'FunctionAlreadyExists') throw e
    // Function exists — return its live ARN
    const desc = await cf.send(new DescribeFunctionCommand({ Name: name, Stage: 'LIVE' }))
    console.log('Using existing CloudFront Function:', name)
    return desc.FunctionSummary.FunctionMetadata.FunctionARN
  }
}

async function upsertBehavior(distId, bucketDomain, oacId, fnArn) {
  const { DistributionConfig: cfg, ETag } = await cf.send(
    new GetDistributionConfigCommand({ Id: distId })
  )

  // Remove any previous CertPath entries (idempotent update)
  cfg.Origins.Items = cfg.Origins.Items.filter(o => o.Id !== ORIGIN_ID)
  if (!cfg.CacheBehaviors) cfg.CacheBehaviors = { Quantity: 0, Items: [] }
  cfg.CacheBehaviors.Items = (cfg.CacheBehaviors.Items || []).filter(
    b => b.PathPattern !== PATH_PATTERN
  )

  // Add S3 origin with OAC
  cfg.Origins.Items.push({
    Id: ORIGIN_ID,
    DomainName: bucketDomain,
    OriginPath: '',
    CustomHeaders: { Quantity: 0, Items: [] },
    S3OriginConfig: { OriginAccessIdentity: '' },
    OriginAccessControlId: oacId,
    ConnectionAttempts: 3,
    ConnectionTimeout: 10,
  })
  cfg.Origins.Quantity = cfg.Origins.Items.length

  // Add /aws* behavior (CachingOptimized + CloudFront Function for SPA routing)
  cfg.CacheBehaviors.Items.push({
    PathPattern: PATH_PATTERN,
    TargetOriginId: ORIGIN_ID,
    ViewerProtocolPolicy: 'redirect-to-https',
    CachePolicyId: CACHE_POLICY_ID,
    Compress: true,
    FunctionAssociations: {
      Quantity: 1,
      Items: [{ FunctionARN: fnArn, EventType: 'viewer-request' }],
    },
    AllowedMethods: {
      Quantity: 2,
      Items: ['GET', 'HEAD'],
      CachedMethods: { Quantity: 2, Items: ['GET', 'HEAD'] },
    },
    LambdaFunctionAssociations: { Quantity: 0, Items: [] },
    TrustedSigners: { Enabled: false, Quantity: 0, Items: [] },
    TrustedKeyGroups: { Enabled: false, Quantity: 0, Items: [] },
    FieldLevelEncryptionId: '',
    MinTTL: 0,
  })
  cfg.CacheBehaviors.Quantity = cfg.CacheBehaviors.Items.length

  await cf.send(new UpdateDistributionCommand({
    Id: distId,
    IfMatch: ETag,
    DistributionConfig: cfg,
  }))
  console.log('Distribution updated:', distId)
}

async function removeBehavior(distId, fnName) {
  try {
    const { DistributionConfig: cfg, ETag } = await cf.send(
      new GetDistributionConfigCommand({ Id: distId })
    )

    cfg.Origins.Items = cfg.Origins.Items.filter(o => o.Id !== ORIGIN_ID)
    cfg.Origins.Quantity = cfg.Origins.Items.length

    if (cfg.CacheBehaviors?.Items) {
      cfg.CacheBehaviors.Items = cfg.CacheBehaviors.Items.filter(b => b.PathPattern !== PATH_PATTERN)
      cfg.CacheBehaviors.Quantity = cfg.CacheBehaviors.Items.length
    }

    await cf.send(new UpdateDistributionCommand({
      Id: distId,
      IfMatch: ETag,
      DistributionConfig: cfg,
    }))
    console.log('Removed CertPath behavior from distribution:', distId)
  } catch (e) {
    console.warn('Could not remove behavior (may not exist):', e.message)
  }

  // Delete the CloudFront Function
  try {
    const desc = await cf.send(new DescribeFunctionCommand({ Name: fnName }))
    await cf.send(new DeleteFunctionCommand({ Name: fnName, IfMatch: desc.ETag }))
    console.log('Deleted CloudFront Function:', fnName)
  } catch (e) {
    console.warn('Could not delete function:', e.message)
  }
}
