#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { CertpathStack } from '../lib/certpath-stack'

const app = new cdk.App()

new CertpathStack(app, 'CertpathStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'AWS CertPath — AI-powered certification path planner',
})
