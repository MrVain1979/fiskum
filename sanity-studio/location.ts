import { defineLocations } from "sanity/presentation";

export const locations = {
  service: defineLocations({
    select: {
      title: "title",
      slug: "slug.current",
    },
    resolve: (doc) => {
      const slug = doc?.slug?.replace(/^\/+/, "") || "";
      return {
        locations: [
          { title: doc?.title || "Tjeneste", href: `/${slug}/` },
          { title: "Tjenester", href: "/tjenester/" },
        ],
      };
    },
  }),
  projectReference: defineLocations({
    select: {
      title: "title",
      slug: "slug.current",
    },
    resolve: (doc) => {
      const slug = doc?.slug?.replace(/^\/+/, "") || "";
      return {
        locations: [
          { title: doc?.title || "Referanse", href: `/referanser/${slug}/` },
          { title: "Referanser", href: "/referanser/" },
        ],
      };
    },
  }),
  newsPost: defineLocations({
    select: {
      title: "title",
      slug: "slug.current",
    },
    resolve: (doc) => {
      const slug = doc?.slug?.replace(/^\/+/, "") || "";
      return {
        locations: [
          { title: doc?.title || "Aktuelt", href: `/aktuelt/${slug}/` },
          { title: "Aktuelt", href: "/aktuelt/" },
        ],
      };
    },
  }),
  blog: defineLocations({
    select: {
      title: "title",
      slug: "slug.current",
    },
    resolve: (doc) => {
      return {
        locations: [
          {
            title: doc?.title || "Untitled",
            href: `${doc?.slug}`,
          },
          {
            title: "Blog",
            href: "/blog",
          },
        ],
      };
    },
  }),
  home: defineLocations({
    select: {
      title: "title",
      slug: "slug.current",
    },
    resolve: () => {
      return {
        locations: [
          {
            title: "Home",
            href: "/",
          },
        ],
      };
    },
  }),
  page: defineLocations({
    select: {
      title: "title",
      slug: "slug.current",
    },
    resolve: (doc) => {
      return {
        locations: [
          {
            title: doc?.title || "Untitled",
            href: `${doc?.slug}`,
          },
        ],
      };
    },
  }),
};
