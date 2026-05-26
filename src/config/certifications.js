export const CERTIFICATIONS = [
  { id: 'ccp', name: 'Cloud Practitioner',        level: 'Foundational', code: 'CLF-C02' },
  { id: 'saa', name: 'Solutions Architect',        level: 'Associate',    code: 'SAA-C03' },
  { id: 'dva', name: 'Developer',                  level: 'Associate',    code: 'DVA-C02' },
  { id: 'soa', name: 'SysOps Administrator',       level: 'Associate',    code: 'SOA-C02' },
  { id: 'sap', name: 'Solutions Architect Pro',    level: 'Professional', code: 'SAP-C02' },
  { id: 'dop', name: 'DevOps Engineer Pro',        level: 'Professional', code: 'DOP-C02' },
  { id: 'ans', name: 'Advanced Networking',        level: 'Specialty',    code: 'ANS-C01' },
  { id: 'dbs', name: 'Database',                   level: 'Specialty',    code: 'DBS-C01' },
  { id: 'das', name: 'Data Analytics',             level: 'Specialty',    code: 'DAS-C01' },
  { id: 'scs', name: 'Security',                   level: 'Specialty',    code: 'SCS-C02' },
  { id: 'mls', name: 'Machine Learning',           level: 'Specialty',    code: 'MLS-C01' },
]

export const CERT_LEVEL_STYLES = {
  Foundational: { ring: '#818cf8', glow: '99,102,241',   tag: '#6366f1' },
  Associate:    { ring: '#4ade80', glow: '34,197,94',    tag: '#16a34a' },
  Professional: { ring: '#fb923c', glow: '249,115,22',   tag: '#ea580c' },
  Specialty:    { ring: '#c084fc', glow: '192,132,252',  tag: '#9333ea' },
}

export const CERT_LEVELS_ORDER = ['Foundational', 'Associate', 'Professional', 'Specialty']
