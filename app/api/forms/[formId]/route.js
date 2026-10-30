import {handleFormRequest} from '../../../../lib/form-inbox.mjs'
import {formInboxConfig} from '../../../../lib/form-inbox-config.mjs'

export const runtime = 'nodejs'

export async function POST(request) {
  try {
    return await handleFormRequest(request, await formInboxConfig())
  } catch {
    console.error('Form inbox configuration unavailable')
    return Response.json({success: false, message: 'Meldingen kunne ikke mottas. Prøv igjen senere eller kontakt oss på e-post.'}, {status: 503, headers: {'Cache-Control': 'no-store'}})
  }
}
