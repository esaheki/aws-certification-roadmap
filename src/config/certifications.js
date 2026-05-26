export const CERTIFICATIONS = [
  // Foundational
  { id: 'ccp', name: 'Cloud Practitioner',          level: 'Foundational', code: 'CLF-C02' },
  { id: 'aif', name: 'AI Practitioner',             level: 'Foundational', code: 'AIF-C01' },
  // Associate
  { id: 'saa', name: 'Solutions Architect',          level: 'Associate',    code: 'SAA-C03' },
  { id: 'dva', name: 'Developer',                    level: 'Associate',    code: 'DVA-C02' },
  { id: 'soa', name: 'CloudOps Engineer',            level: 'Associate',    code: 'SOA-C03' },
  { id: 'dea', name: 'Data Engineer',                level: 'Associate',    code: 'DEA-C01' },
  { id: 'mla', name: 'Machine Learning Engineer',    level: 'Associate',    code: 'MLA-C01' },
  // Professional
  { id: 'sap', name: 'Solutions Architect Pro',      level: 'Professional', code: 'SAP-C02' },
  { id: 'dop', name: 'DevOps Engineer Pro',          level: 'Professional', code: 'DOP-C02' },
  { id: 'aip', name: 'Generative AI Developer Pro',  level: 'Professional', code: 'AIP-C01' },
  // Specialty
  { id: 'ans', name: 'Advanced Networking',          level: 'Specialty',    code: 'ANS-C01' },
  { id: 'scs', name: 'Security',                     level: 'Specialty',    code: 'SCS-C02' },
]

export const CERT_LEVEL_STYLES = {
  Foundational: { ring: '#94a3b8', glow: '148,163,184',  tag: '#64748b' },
  Associate:    { ring: '#60a5fa', glow: '96,165,250',   tag: '#3b82f6' },
  Professional: { ring: '#2dd4bf', glow: '45,212,191',   tag: '#0d9488' },
  Specialty:    { ring: '#c084fc', glow: '192,132,252',  tag: '#9333ea' },
}

export const CERT_LEVELS_ORDER = ['Foundational', 'Associate', 'Professional', 'Specialty']
