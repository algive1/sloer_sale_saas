import { useIntl } from "react-intl";

import styles from "../menu/CommerceSidebar.module.css";
import { ADMIN_ACCENTS, type AdminAccent, useSidebarBreakpointContext } from "../SidebarContext";

/**
 * Admin-only preference. Macaw's light/dark switch and all brand themes are
 * completely separate from this browser-local sidebar accent.
 */
export const AdminAccentPicker = () => {
  const { accent, setAccent } = useSidebarBreakpointContext();
  const intl = useIntl();
  const isZh = intl.locale.toLowerCase().startsWith("zh");
  const colors: { key: AdminAccent; label: string }[] = [
    { key: "blue", label: isZh ? "蓝色" : "Blue" },
    { key: "slate", label: isZh ? "灰黑" : "Slate" },
    { key: "teal", label: isZh ? "青绿" : "Teal" },
  ];

  return (
    <div className={styles.accentSettings}>
      <span className={styles.accentLabel}>
        {isZh ? "后台导航配色" : "Navigation color"}
      </span>
      <div
        className={styles.accentSwatches}
        role="group"
        aria-label={isZh ? "后台导航颜色" : "Admin navigation accent"}
      >
        {colors.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`${styles.accentSwatch} ${accent === key ? styles.accentSwatchSelected : ""}`}
            style={{ backgroundColor: ADMIN_ACCENTS[key] }}
            aria-label={label}
            aria-pressed={accent === key}
            title={label}
            onClick={() => setAccent(key)}
          />
        ))}
      </div>
    </div>
  );
};
