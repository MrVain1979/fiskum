import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  // Aktiver preview-mode
  res.setPreviewData({});
  res.writeHead(307, { Location: "/" });
  res.end();
}
