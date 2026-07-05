import { useId } from "react";

export function SearchBar({
  value = "",
  onChange,
  placeholder = "Search…",
  className = "",
  size = "md",
  disabled = false,
  id: idProp,
  "aria-label": ariaLabel = "Search",
  hint = null,
  onClear,
}) {
  const autoId = useId();
  const inputId = idProp || autoId;
  const hasValue = Boolean(String(value || "").length);

  const handleClear = () => {
    if (onClear) {
      onClear();
      return;
    }
    onChange?.({ target: { value: "" } });
  };

  return (
    <div className={`admin-search ${size === "sm" ? "admin-search--sm" : ""} ${className}`.trim()}>
      <label htmlFor={inputId} className="visually-hidden">
        {ariaLabel}
      </label>
      <div className="admin-search__field">
        <span className="material-icons admin-search__icon" aria-hidden="true">
          search
        </span>
        <input
          id={inputId}
          type="search"
          className="form-control admin-search__input"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          aria-label={ariaLabel}
          autoComplete="off"
          spellCheck={false}
        />
        {hasValue ? (
          <button
            type="button"
            className="admin-search__clear"
            onClick={handleClear}
            aria-label="Clear search"
            disabled={disabled}
          >
            <span className="material-icons">close</span>
          </button>
        ) : null}
      </div>
      {hint ? <p className="admin-search__hint mb-0">{hint}</p> : null}
    </div>
  );
}
