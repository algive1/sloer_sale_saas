import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useContext } from "react";
import { FormattedMessage } from "react-intl";

import { Locale, LocaleContext, LocaleProvider } from "./Locale";

// This regression needs the real provider; the shared Jest mapper omits translations.
jest.mock("react-intl", () => jest.requireActual("../../../node_modules/react-intl"));
jest.mock("../../../locale/zh-Hans.json", () => ({
  __esModule: true,
  default: { mr9jbO: { string: "中文内容" } },
}));
jest.mock("../../../locale/zh-Hant.json", () => ({
  __esModule: true,
  default: { mr9jbO: { string: "繁體內容" } },
}));

function LanguageControls(): React.ReactNode {
  const { setLocale } = useContext(LocaleContext);

  return (
    <>
      <button onClick={() => setLocale(Locale.EN)}>English</button>
      <button onClick={() => setLocale(Locale.ZH_HANS)}>简体中文</button>
      <button onClick={() => setLocale(Locale.ZH_HANT)}>繁體中文</button>
      <FormattedMessage id="mr9jbO" defaultMessage="Preferred Language" />
    </>
  );
}

it("loads translations on every language change, including returning to Chinese", async () => {
  // Arrange
  localStorage.clear();
  render(
    <LocaleProvider>
      <LanguageControls />
    </LocaleProvider>,
  );
  // Act and Assert
  fireEvent.click(screen.getByText("简体中文"));
  await waitFor(() => expect(screen.getByText("中文内容")).toBeInTheDocument());
  fireEvent.click(screen.getByText("繁體中文"));
  await waitFor(() => expect(screen.getByText("繁體內容")).toBeInTheDocument());
  fireEvent.click(screen.getByText("English"));
  await waitFor(() => expect(screen.getByText("Preferred Language")).toBeInTheDocument());
  fireEvent.click(screen.getByText("简体中文"));
  await waitFor(() => expect(screen.getByText("中文内容")).toBeInTheDocument());
});
