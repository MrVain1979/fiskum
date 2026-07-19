function readEnv(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}

readEnv(["SANITY_PROJECT_ID", "SANITY_STUDIO_PROJECT_ID", "NEXT_PUBLIC_SANITY_PROJECT_ID"]);
readEnv(["SANITY_DATASET", "SANITY_STUDIO_DATASET", "NEXT_PUBLIC_SANITY_DATASET"]);
readEnv(["SANITY_API_VERSION", "SANITY_STUDIO_API_VERSION", "NEXT_PUBLIC_SANITY_API_VERSION"]);
