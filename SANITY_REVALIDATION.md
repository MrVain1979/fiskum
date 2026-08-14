# Sanity revalidation

Frontend builds with Next.js SSG and serves static HTML to visitors.
Sanity is only queried on the server during build and on-demand revalidation.

Ordinary CMS publishing must not trigger a full Vercel Production Deploy.
Use a Sanity webhook that sends a signed `POST` request to:

```text
https://www.fiskum-sveis.no/api/revalidate
```

Required Vercel environment variable:

```text
SANITY_REVALIDATE_SECRET=<same secret as the Sanity webhook>
```

Recommended webhook projection:

```groq
{
  "_id": _id,
  "_type": _type,
  "slug": slug.current,
  "publishedAt": publishedAt
}
```

The route handler maps document types to affected static routes and calls
`revalidateTag()`/`revalidatePath()` only for those routes. Full deploy is only
needed for code, Next.js config, Sanity schema, or other technical changes.
