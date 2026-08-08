const externalServer = process.env.LIGHTHOUSE_EXTERNAL_SERVER === "true";
const baseUrl = (process.env.LIGHTHOUSE_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

module.exports = {
  ci: {
    collect: {
      ...(externalServer
        ? {}
        : {
            startServerCommand: "npm run start -- --hostname 127.0.0.1 --port 3000",
            startServerReadyPattern: "Ready in|Local:",
            startServerReadyTimeout: 120000,
          }),
      url: [`${baseUrl}/`],
      numberOfRuns: 3,
      settings: {
        formFactor: "mobile",
        screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2.75, disabled: false },
        throttlingMethod: "simulate",
        chromeFlags: "--headless --no-sandbox --disable-dev-shm-usage",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.8 }],
        "categories:accessibility": ["error", { minScore: 1 }],
        "categories:best-practices": ["error", { minScore: 0.95 }],
        "categories:seo": ["error", { minScore: 1 }],
        "first-contentful-paint": ["error", { maxNumericValue: 2000 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["error", { maxNumericValue: 250 }],
        "speed-index": ["warn", { maxNumericValue: 3500 }],
        "interactive": ["warn", { maxNumericValue: 4000 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: "./lighthouse-reports/mobile",
      reportFilenamePattern: "%%PATHNAME%%-%%DATETIME%%-report.%%EXTENSION%%",
    },
  },
};
