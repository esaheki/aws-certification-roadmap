export const CERTIFICATIONS = [
  // Foundational
  { id: 'ccp', name: 'Cloud Practitioner',          level: 'Foundational', code: 'CLF-C02', guideUrl: 'https://docs.aws.amazon.com/aws-certification/latest/cloud-practitioner-02/cloud-practitioner-02.html' },
  { id: 'aif', name: 'AI Practitioner',             level: 'Foundational', code: 'AIF-C01', guideUrl: 'https://docs.aws.amazon.com/aws-certification/latest/ai-practitioner-01/ai-practitioner-01.html' },
  // Associate
  { id: 'saa', name: 'Solutions Architect',          level: 'Associate',    code: 'SAA-C03', guideUrl: 'https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-associate-03/solutions-architect-associate-03.html' },
  { id: 'dva', name: 'Developer',                    level: 'Associate',    code: 'DVA-C02', guideUrl: 'https://docs.aws.amazon.com/aws-certification/latest/developer-associate-02/developer-associate-02.html' },
  { id: 'soa', name: 'CloudOps Engineer',            level: 'Associate',    code: 'SOA-C03', guideUrl: 'https://docs.aws.amazon.com/aws-certification/latest/sysops-administrator-associate-03/sysops-administrator-associate-03.html' },
  { id: 'dea', name: 'Data Engineer',                level: 'Associate',    code: 'DEA-C01', guideUrl: 'https://docs.aws.amazon.com/aws-certification/latest/data-engineer-associate-01/data-engineer-associate-01.html' },
  { id: 'mla', name: 'Machine Learning Engineer',    level: 'Associate',    code: 'MLA-C01', guideUrl: 'https://docs.aws.amazon.com/aws-certification/latest/machine-learning-engineer-associate-01/machine-learning-engineer-associate-01.html' },
  // Professional
  { id: 'sap', name: 'Solutions Architect Pro',      level: 'Professional', code: 'SAP-C02', guideUrl: 'https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-professional-02/solutions-architect-professional-02.html' },
  { id: 'dop', name: 'DevOps Engineer Pro',          level: 'Professional', code: 'DOP-C02', guideUrl: 'https://docs.aws.amazon.com/aws-certification/latest/devops-engineer-professional-02/devops-engineer-professional-02.html' },
  { id: 'aip', name: 'Generative AI Developer Pro',  level: 'Professional', code: 'AIP-C01', guideUrl: 'https://docs.aws.amazon.com/aws-certification/latest/ai-professional-01/ai-professional-01.html' },
  // Specialty
  { id: 'ans', name: 'Advanced Networking',          level: 'Specialty',    code: 'ANS-C01', guideUrl: 'https://docs.aws.amazon.com/aws-certification/latest/advanced-networking-specialty-01/advanced-networking-specialty-01.html' },
  { id: 'scs', name: 'Security',                     level: 'Specialty',    code: 'SCS-C02', guideUrl: 'https://docs.aws.amazon.com/aws-certification/latest/security-specialty-03/security-specialty-03.html' },
]

export const CERT_LEVEL_STYLES = {
  Foundational: { ring: '#94a3b8', glow: '148,163,184',  tag: '#64748b' },
  Associate:    { ring: '#60a5fa', glow: '96,165,250',   tag: '#3b82f6' },
  Professional: { ring: '#2dd4bf', glow: '45,212,191',   tag: '#0d9488' },
  Specialty:    { ring: '#c084fc', glow: '192,132,252',  tag: '#9333ea' },
}

export const CERT_LEVELS_ORDER = ['Foundational', 'Associate', 'Professional', 'Specialty']
