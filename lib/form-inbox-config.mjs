export async function formInboxConfig(env = process.env, fetcher = fetch) {
  const projectId = env.SANITY_PROJECT_ID || env.SANITY_STUDIO_PROJECT_ID || env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'qgyys6fw'
  const dataset = env.SANITY_DATASET || env.SANITY_STUDIO_DATASET || env.NEXT_PUBLIC_SANITY_DATASET || 'production'
  const token = env.SANITY_FORM_WRITE_TOKEN
  const url = new URL(`https://${projectId}.api.sanity.io/v2025-06-01/data/query/${dataset}`)
  url.searchParams.set('query', '*[_type == "settings" && !(_id in path("drafts.**"))][0]{contactEmail, contactFormEnabled}')
  url.searchParams.set('perspective', 'published')
  const response = await fetcher(url, {cache: 'no-store', signal: AbortSignal.timeout(10000), headers: env.SANITY_API_READ_TOKEN ? {Authorization: `Bearer ${env.SANITY_API_READ_TOKEN}`} : {}})
  if (!response.ok) throw new Error('Contact settings unavailable')
  const {result} = await response.json()
  const forms = result?.contactFormEnabled ? {contact: {
    title: 'Ny forespørsel fra fiskum-sveis.no', recipient: result.contactEmail || '',
    successPath: '/kontakt-oss/?sendt=1',
    allowedFields: ['name', 'email', 'phone', 'topic', 'message'],
    requiredFields: ['name', 'email', 'topic', 'message'], emailField: 'email', nameFields: ['name'],
  }} : {}
  return {projectId, dataset, token, siteUrl: env.SITE_URL || env.NEXT_PUBLIC_SITE_URL || 'https://www.fiskum-sveis.no', allowedOrigins: ['https://www.fiskum-sveis.no', 'https://fiskum-sveis.no'], forms}
}
