import { commerceOpsExtensionLabel } from "./commerceOpsExtensionLabel";

describe("system App navigation labels", () => {
  const input = {
    appUrl: "http://localhost:9000/commerce-admin",
    extensionUrl: "/app?path=%2Fops%2Fanalytics",
    dashboardOrigin: "http://localhost:9000",
    locale: "en",
  };

  it("uses the existing operations registry for English and Chinese", () => {
    // Arrange / Act
    const english = commerceOpsExtensionLabel(input);
    const chinese = commerceOpsExtensionLabel({ ...input, locale: "zh-Hans" });

    // Assert
    expect(english).toBe("Overview");
    expect(chinese).toBe("经营总览");
  });

  it("leaves foreign Apps and unknown routes unchanged", () => {
    // Arrange
    const variations = [
      { appUrl: "https://other.example/commerce-admin" },
      { appUrl: "http://localhost:9000/other-app" },
      { appUrl: "invalid" },
      { extensionUrl: "/app?path=%2Fops%2Funknown" },
      { extensionUrl: "https://other.example/app?path=%2Fops%2Fanalytics" },
    ];

    // Act / Assert
    variations.forEach(variation =>
      expect(commerceOpsExtensionLabel({ ...input, ...variation })).toBeNull(),
    );
  });
});
