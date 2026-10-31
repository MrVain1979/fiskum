import { defineQuery } from "next-sanity";
export const routeTypeFilter = `_type in ["homePage","page","service","projectReference","newsPost"]`;
export const publishedFilter = `!(_id in path("drafts.**")) && !(_id in path("versions.**"))`;
export const imageProjection = `_key,_type,alt,decorative,caption,credit,crop,hotspot,"url":asset->url,asset->{_id,url,mimeType,metadata{dimensions{width,height}}}`;
export const linkProjection = `_type,openInNewTab,target{...,document->{_id,_type,title,navigationTitle,"slug":slug.current,publishedAt},file{asset->{_id,url,originalFilename}}}`;
export const portableProjection = `...,markDefs[]{...,customLink{${linkProjection}}},_type in ["image","imageWithAlt"]=>{${imageProjection}}`;
export const identityProjection = `_id,_type,"slug":slug.current,publishedAt,seoNoIndex,_createdAt,previousPaths,"canonical":seo.canonical,"parentId":parent._ref,title,navigationTitle`;
export const sectionProjection = `...,image{${imageProjection}},images[]{${imageProjection}},richText[]{${portableProjection}},subTitle[]{${portableProjection}},helperText[]{${portableProjection}},cards[]{...,image{${imageProjection}},richText[]{${portableProjection}},url{${linkProjection}}},faqs[]->{_id,_type,title,richText[]{${portableProjection}}},link{...,url{${linkProjection}}},serviceLink{_key,text,variant,url{${linkProjection}}},buttons[]{_key,text,variant,url{${linkProjection}}},moreLink{_key,text,variant,url{${linkProjection}}},files[]{_key,title,description,"url":file.asset->url}`;
const gallery = `sections[_type=="gallerySection" && hidden!=true][0]`;
export const sharedFields = `${identityProjection},_updatedAt,internalTitle,title,navigationTitle,intro,summary,excerpt,icon,sidebarVariant,
 listingPage->{_id,_type,title,"slug":slug.current},seo{...,image{${imageProjection}}},mainImage{${imageProjection}},
 parent->{_id,_type,title,navigationTitle,"slug":slug.current,parent->{_id,_type,title,navigationTitle,"slug":slug.current}},
 "children":*[_type=="page" && parent._ref==^._id && ${publishedFilter}]{_id,_type,title,navigationTitle,"slug":slug.current},
 sections[]{${sectionProjection}}`;
export const documentProjection = `${sharedFields},
 _type in ["service","projectReference"]=>{"image":${gallery}.images[0]{${imageProjection}},"_imageSectionKey":${gallery}._key},
 _type=="newsPost"=>{"image":mainImage{${imageProjection}}}`;
export const settingsProjection = `_id,_type,_updatedAt,companyName,siteName,siteTitle,siteDescription,phone,contactEmail,contactFormEnabled,address,socialLinks,logo{${imageProjection}},defaultSeo{...,image{${imageProjection}}}`;
export const navbarProjection = `_id,_type,_updatedAt,columns[]{_key,_type,name,title,url{${linkProjection}},links[]{_key,name,url{${linkProjection}}}}`;
export const footerProjection = `_id,_type,_updatedAt,subtitle,copyrightText,developerCreditText,developerCreditUrl,columns[]{_key,title,links[]{_key,name,url{${linkProjection}}}}`;
export const faqProjection = `_id,_type,title,richText[]{${portableProjection}}`;
export const redirectProjection = `_id,_type,title,from,permanent,to{${linkProjection}}`;

export const routeIndexQuery = defineQuery(
  `*[${routeTypeFilter} && ${publishedFilter}] | order(_createdAt asc){${identityProjection}}`,
);
export const pageIdentitiesQuery = defineQuery(
  `*[${routeTypeFilter} && ${publishedFilter} && ((_type=="homePage" && $home)||(_type!="homePage" && slug.current in $slugs))] | order(_createdAt asc){${identityProjection}}`,
);
export const documentQuery = defineQuery(
  `*[${routeTypeFilter} && _id==$id && ${publishedFilter}][0]{${documentProjection}}`,
);
export const settingsQuery = defineQuery(
  `*[_type=="settings" && ${publishedFilter}][0]{${settingsProjection}}`,
);
export const navbarQuery = defineQuery(
  `*[_type=="navbar" && ${publishedFilter}][0]{${navbarProjection}}`,
);
export const footerQuery = defineQuery(
  `*[_type=="footer" && ${publishedFilter}][0]{${footerProjection}}`,
);
const cards = `_id,_type,title,internalTitle,navigationTitle,summary,excerpt,icon,publishedAt,"slug":slug.current`;
export const servicesQuery = defineQuery(
  `*[_type=="service" && ${publishedFilter}] | order(_createdAt asc){${cards}}`,
);
export const referencesQuery = defineQuery(
  `*[_type=="projectReference" && ${publishedFilter}] | order(_createdAt asc){${cards},"image":${gallery}.images[0]{${imageProjection}},"_imageSectionKey":${gallery}._key}`,
);
export const newsQuery = defineQuery(
  `*[_type=="newsPost" && ${publishedFilter}] | order(publishedAt desc){${cards},"image":mainImage{${imageProjection}}}`,
);
export const faqsQuery = defineQuery(
  `*[_type=="faq" && ${publishedFilter}] | order(_createdAt asc){${faqProjection}}`,
);
export const redirectsQuery = defineQuery(
  `*[_type=="redirect" && ${publishedFilter} && from in $from] | order(_createdAt asc){${redirectProjection}}`,
);
export const historyQuery = defineQuery(
  `*[${routeTypeFilter} && ${publishedFilter} && $path in previousPaths][0]{${identityProjection}}`,
);
export const referringDocumentsQuery = defineQuery(
  `*[_type in ["homePage","page","service","projectReference","newsPost","settings","navbar","footer","faq","redirect"] && ${publishedFilter} && references($ids)]{${identityProjection},from}`,
);
export const formSettingsQuery = defineQuery(
  `*[_type=="settings" && ${publishedFilter}][0]{contactEmail,contactFormEnabled,"newsletterPublished":count(*[${routeTypeFilter} && ${publishedFilter} && count(sections[_type=="subscribeNewsletter" && hidden!=true])>0])>0}`,
);
export const allContentQuery = defineQuery(`{
 "settings":*[_type=="settings"][0]{${settingsProjection}},"navbar":*[_type=="navbar"][0]{${navbarProjection}},"footer":*[_type=="footer"][0]{${footerProjection}},
 "homePage":*[_type=="homePage"][0]{${documentProjection}},"pages":*[_type=="page"] | order(_createdAt asc){${documentProjection}},
 "services":*[_type=="service"] | order(_createdAt asc){${documentProjection}},"references":*[_type=="projectReference"] | order(_createdAt asc){${documentProjection},category},
 "newsPosts":*[_type=="newsPost"] | order(publishedAt desc){${documentProjection}},"faqs":*[_type=="faq"] | order(_createdAt asc){${faqProjection}},"redirects":*[_type=="redirect"] | order(_createdAt asc){${redirectProjection}}
}`);
export function contentQuery() {
  return allContentQuery;
}
