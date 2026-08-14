import fs from "node:fs/promises";

import { faker } from "@faker-js/faker";
import { getCliClient } from "sanity/cli";

import {
  generateFooterColumns,
  generateGlobalSettingsData,
  generateMockFooterData,
  generateNavbarColumns,
  generatePageTitle,
  getMockNavbarData,
} from "../utils/const-mock-data";
import { retryPromise } from "../utils/helper";
import {
  generateAndUploadMockImages,
  generateBlogIndexPage,
  generateFAQs,
  generateMockAuthors,
  generateMockBlogPages,
  generateMockSlugPages,
  getMockHomePageData,
} from "../utils/mock-data";

const client = getCliClient();

async function removePostinstallScript() {
  try {
    const packageJson = await fs.readFile("package.json", "utf8");
    const parsedJson = JSON.parse(packageJson);

    if (parsedJson.scripts?.postinstall) {
      // biome-ignore lint/performance/noDelete: <explanation>
      delete parsedJson.scripts.postinstall;
      await fs.writeFile("package.json", JSON.stringify(parsedJson, null, 2));
    }
  } catch (error) {
    console.error("❌ Error removing postinstall script:", error);
    console.log(
      "\n\x1b[34m┌────────────────────────────────────────────┐\x1b[0m",
    );
    console.log(
      "\x1b[34m│                                            │\x1b[0m",
    );
    console.log(
      "\x1b[34m│  Please remove the postinstall script      │\x1b[0m",
    );
    console.log(
      "\x1b[34m│  from package.json to prevent multiple     │\x1b[0m",
    );
    console.log(
      "\x1b[34m│  executions                                │\x1b[0m",
    );
    console.log(
      "\x1b[34m│                                            │\x1b[0m",
    );
    console.log(
      "\x1b[34m└────────────────────────────────────────────┘\x1b[0m\n",
    );
  }
}

async function createData() {
  console.log("🔍 Checking if data exists...");
  console.log("\n");

  console.log("🔄 Starting transaction...");
  const transaction = client.transaction();
  console.log("\n");

  console.log("📸 Generating mock images...");
  const imagesStore = await generateAndUploadMockImages(
    client as unknown as Parameters<typeof generateAndUploadMockImages>[0],
  );
  console.log("\n");

  console.log("🎨 Finding logo image...");
  const logo = imagesStore.find((image) => image.type === "logo");
  console.log("\n");

  console.log("👥 Generating mock authors...");
  const authorsPayloads = generateMockAuthors(imagesStore);

  for (const author of authorsPayloads) {
    transaction.create(author);
  }
  console.log(`✅ Created ${authorsPayloads.length} authors`);
  console.log("\n");

  console.log("❓ Generating FAQs...");
  const faqs = generateFAQs();

  for (const faq of faqs) {
    transaction.create(faq);
  }
  console.log(`✅ Created ${faqs.length} FAQs`);
  console.log("\n");

  console.log("⚙️ Generating global settings...");
  const settings = generateGlobalSettingsData(logo?.id);

  transaction.createIfNotExists(settings);
  console.log("✅ Created global settings");
  console.log("\n");

  console.log("🏠 Generating home page...");
  const homePage = getMockHomePageData({
    imagesStore,
    faqs,
  });

  transaction.createIfNotExists(homePage);
  console.log("✅ Created home page");
  console.log("\n");

  console.log("📄 Generating slug pages...");
  const slugPages = generateMockSlugPages({
    faqs,
    imagesStore,
  });

  for (const page of slugPages) {
    transaction.create(page);
  }
  console.log(`✅ Created ${slugPages.length} slug pages`);
  console.log("\n");

  console.log("📝 Generating blog pages...");
  const blogPages = generateMockBlogPages({
    imagesStore,
    authors: authorsPayloads,
  });

  for (const page of blogPages) {
    transaction.create(page);
  }
  console.log(`✅ Created ${blogPages.length} blog pages`);
  console.log("\n");

  console.log("📚 Generating blog index page...");
  const blogIndexPage = generateBlogIndexPage();

  transaction.createIfNotExists(blogIndexPage);
  console.log("✅ Created blog index page");
  console.log("\n");

  console.log("📑 Generating example pages...");
  const examplePages = Array.from({
    length: faker.number.int({ min: 2, max: 5 }),
  }).map(() => ({
    _id: undefined,
    title: generatePageTitle(),
  }));

  const pageLinks = [...slugPages, ...blogPages, ...examplePages].map(
    (page) => ({
      id: page?._id,
      name: page.title,
    }),
  );
  console.log("\n");

  console.log("🔗 Generating navbar...");
  const navbarLinks = faker.helpers.arrayElements(pageLinks, 7);

  const navbar = getMockNavbarData({
    columns: generateNavbarColumns({
      links: navbarLinks,
    }),
  });

  transaction.createIfNotExists(navbar);
  console.log("✅ Created navbar");
  console.log("\n");

  console.log("👣 Generating footer...");
  const footerLinks = faker.helpers.arrayElements(pageLinks, 7);

  const footer = generateMockFooterData({
    columns: generateFooterColumns({
      links: footerLinks,
    }),
  });

  transaction.createIfNotExists(footer);
  console.log("✅ Created footer");
  console.log("\n");

  console.log("💾 Committing transaction...");
  await transaction.commit();
  console.log("✨ Successfully committed all content!");
  console.log("\n");

  console.log("\n📊 Dataset Information:");
  console.log(`🆔 Project ID: ${client.config().projectId}`);
  console.log(`📁 Dataset: ${client.config().dataset}`);
}

async function main() {
  await retryPromise(
    async () => {
      await createData();
    },
    {
      onRetry(error, attempt) {
        console.log(
          `🔄 Retrying transaction attempt ${attempt}:`,
          error.message,
        );
      },
    },
  );

  console.log("\n🧹 Removing postinstall script...");
  try {
    await removePostinstallScript();
    console.log("✅ Successfully removed postinstall script");
  } catch (error) {
    console.error("❌ Error removing postinstall script:", error);
    console.error(
      "⚠️ Please manually remove the postinstall script from package.json if it still exists",
    );
  }
}

main().catch((error) => {
  console.error("❌ Error creating data:", error);
  process.exit(1);
});
