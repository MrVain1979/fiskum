import { author } from "./author";
import { blog } from "./blog";
import { blogIndex } from "./blog-index";
import { faq } from "./faq";
import { footer } from "./footer";
import { homePage } from "./home-page";
import { navbar } from "./navbar";
import { newsPost } from "./news-post";
import { page } from "./page";
import { projectReference } from "./reference";
import { redirect } from "./redirect";
import { service } from "./service";
import { settings } from "./settings";

export const singletons = [homePage, blogIndex, settings, footer, navbar];

export const documents = [service, projectReference, newsPost, redirect, blog, page, faq, author, ...singletons];
