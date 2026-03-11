/**
 * Playwright global setup — runs once before all tests.
 * Verifies the dev server is reachable.
 */
async function globalSetup() {
  const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";

  console.log("\n[E2E Global Setup]");
  console.log(`  Base URL: ${baseURL}`);
  console.log(`  User: ${process.env.E2E_EMAIL}`);

  // Health check
  try {
    const res = await fetch(baseURL, { redirect: "follow" });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    console.log("  Dev server: reachable");
  } catch (err) {
    throw new Error(
      `Dev server not reachable at ${baseURL}. Make sure the server is running.\n${err}`,
    );
  }

  console.log("[E2E Global Setup] Done\n");
}

export default globalSetup;
