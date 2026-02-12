import React from "react";

function joinClassNames(...values) {
  return values.filter(Boolean).join(" ");
}

export default function Button({
  as: Component = "button",
  variant = "primary",
  loading = false,
  loadingText = "Loading...",
  disabled = false,
  fullWidth = false,
  className = "",
  children,
  onClick,
  ...props
}) {
  const isNativeButton = Component === "button";
  const isDisabled = Boolean(disabled || loading);

  function handleClick(event) {
    if (isDisabled && !isNativeButton) {
      event.preventDefault();
      return;
    }
    if (typeof onClick === "function") {
      onClick(event);
    }
  }

  return (
    <Component
      {...props}
      onClick={handleClick}
      disabled={isNativeButton ? isDisabled : undefined}
      aria-disabled={isDisabled ? "true" : undefined}
      aria-busy={loading ? "true" : undefined}
      className={joinClassNames(
        "btn",
        `btn-${variant}`,
        fullWidth ? "btn-block" : "",
        loading ? "btn-loading" : "",
        className
      )}
    >
      {loading ? (
        <>
          <span className="btn-spinner" aria-hidden="true" />
          <span>{loadingText}</span>
        </>
      ) : (
        children
      )}
    </Component>
  );
}
