/**
 * AWS services organised by category.
 * Each value maps to a proficiency level: 0=None, 1=Basic, 2=Intermediate, 3=Advanced
 */
export const SERVICES = {
  'Compute':           ['EC2','Lambda','ECS','EKS','Fargate','Elastic Beanstalk','Batch','Lightsail'],
  'Storage':           ['S3','EBS','EFS','FSx','S3 Glacier','Storage Gateway','Backup'],
  'Database':          ['RDS','Aurora','DynamoDB','ElastiCache','Redshift','DocumentDB','Neptune'],
  'Networking':        ['VPC','Route 53','CloudFront','API Gateway','ELB/ALB/NLB','Direct Connect','Transit Gateway'],
  'Security & IAM':    ['IAM','Cognito','KMS','WAF','Shield','GuardDuty','Security Hub','Inspector','Secrets Manager'],
  'ML & AI':           ['SageMaker','Bedrock','Rekognition','Comprehend','Textract','Polly','Lex','Translate'],
  'DevOps & IaC':      ['CodePipeline','CodeBuild','CodeDeploy','CodeCommit','CloudFormation','CDK','Systems Manager','SAM'],
  'Monitoring & Ops':  ['CloudWatch','CloudTrail','X-Ray','Config','Trusted Advisor','Health Dashboard','EventBridge'],
  'Messaging':         ['SQS','SNS','EventBridge','Step Functions','Kinesis','MSK','MQ'],
  'Analytics':         ['Athena','Glue','EMR','QuickSight','Lake Formation','Data Firehose','OpenSearch'],
}

export const PROFICIENCY_LEVELS = [
  { label: 'None',         bg: 'rgba(15,23,42,0.6)',    text: '#334155', border: 'rgba(255,255,255,0.06)', dot: ''    },
  { label: 'Basic',        bg: 'rgba(148,163,184,0.12)', text: '#94a3b8', border: 'rgba(148,163,184,0.3)',  dot: '●'   },
  { label: 'Intermediate', bg: 'rgba(96,165,250,0.12)',  text: '#60a5fa', border: 'rgba(96,165,250,0.35)',  dot: '●●'  },
  { label: 'Advanced',     bg: 'rgba(45,212,191,0.12)',  text: '#2dd4bf', border: 'rgba(45,212,191,0.4)',   dot: '●●●' },
]
