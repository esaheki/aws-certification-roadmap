export const SERVICES = {
  'Compute':           ['EC2', 'EC2 Auto Scaling', 'Lambda', 'ECS', 'EKS', 'Fargate', 'App Runner', 'Elastic Beanstalk', 'Batch', 'Lightsail', 'Outposts'],
  'Storage':           ['S3', 'EBS', 'EFS', 'FSx', 'S3 Glacier', 'Storage Gateway', 'Snow Family', 'DataSync', 'Transfer Family', 'Backup'],
  'Database':          ['RDS', 'Aurora', 'DynamoDB', 'ElastiCache', 'MemoryDB', 'Redshift', 'DocumentDB', 'Neptune', 'Timestream', 'QLDB', 'Keyspaces'],
  'Networking':        ['VPC', 'Route 53', 'CloudFront', 'API Gateway', 'ELB/ALB/NLB', 'Global Accelerator', 'PrivateLink', 'Direct Connect', 'Site-to-Site VPN', 'Transit Gateway', 'Network Firewall'],
  'Security & IAM':    ['IAM', 'Organizations', 'IAM Identity Center', 'Control Tower', 'Cognito', 'KMS', 'CloudHSM', 'ACM', 'Secrets Manager', 'WAF', 'Shield', 'Macie', 'GuardDuty', 'Security Hub', 'Inspector', 'RAM'],
  'ML & AI':           ['SageMaker', 'Bedrock', 'Rekognition', 'Comprehend', 'Textract', 'Transcribe', 'Polly', 'Translate', 'Lex', 'Forecast', 'Personalize', 'Kendra'],
  'DevOps & IaC':      ['CodePipeline', 'CodeBuild', 'CodeDeploy', 'CodeCommit', 'CodeArtifact', 'CodeGuru', 'ECR', 'CloudFormation', 'CDK', 'SAM', 'Amplify', 'Systems Manager', 'AppConfig'],
  'Monitoring & Ops':  ['CloudWatch', 'CloudTrail', 'X-Ray', 'Config', 'Cost Explorer', 'Budgets', 'Compute Optimizer', 'Trusted Advisor', 'Health Dashboard', 'Service Catalog'],
  'Messaging & Events':['SQS', 'SNS', 'EventBridge', 'Step Functions', 'AppSync', 'Kinesis', 'MSK', 'MQ', 'IoT Core'],
  'Analytics':         ['Athena', 'Glue', 'EMR', 'QuickSight', 'Lake Formation', 'Data Firehose', 'OpenSearch', 'Clean Rooms'],
  'Migration & Transfer': ['Migration Hub', 'Application Migration Service', 'Application Discovery Service', 'DMS', 'Schema Conversion Tool', 'Mainframe Modernization'],
  'Governance & Frameworks': ['Well-Architected Framework', 'Shared Responsibility Model', 'Cloud Adoption Framework', 'AWS Artifact', 'Audit Manager', 'License Manager'],
}

export const PROFICIENCY_LEVELS = [
  { label: 'None',         bg: 'rgba(15,23,42,0.6)',    text: '#334155', border: 'rgba(255,255,255,0.06)', dot: ''    },
  { label: 'Basic',        bg: 'rgba(148,163,184,0.12)', text: '#94a3b8', border: 'rgba(148,163,184,0.3)',  dot: '●'   },
  { label: 'Intermediate', bg: 'rgba(96,165,250,0.12)',  text: '#60a5fa', border: 'rgba(96,165,250,0.35)',  dot: '●●'  },
  { label: 'Advanced',     bg: 'rgba(45,212,191,0.12)',  text: '#2dd4bf', border: 'rgba(45,212,191,0.4)',   dot: '●●●' },
]
