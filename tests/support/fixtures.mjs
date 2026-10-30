export const testImage = {
  _type: "image",
  alt: "Beskrivelse av godkjent delingsbilde",
  asset: {
    _id: "image-abcd-1900x1000-jpg",
    url: "https://cdn.sanity.io/images/qgyys6fw/production/abcd-1900x1000.jpg",
    mimeType: "image/jpeg",
    metadata: { dimensions: { width: 1900, height: 1000 } },
  },
};
export const testSettings = {
  companyName: "Testbedrift",
  siteName: "Nettstedet",
  defaultSeo: {
    title: "Nettstedet",
    description: "Felles beskrivelse fra innstillingene.",
    image: testImage,
  },
};
export const projectedLink = (document) => ({
  target: { kind: "internal", document },
});
