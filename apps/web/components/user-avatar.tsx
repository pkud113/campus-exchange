type Props = {
  name: string;
  mediaId?: string | null;
  size?: "default" | "large" | "profile";
  tone?: "coral" | "mint" | "lilac" | "sand" | "blue";
  className?: string;
};

export function UserAvatar({
  name,
  mediaId,
  size = "default",
  tone = "coral",
  className = "",
}: Props) {
  const sizeClass =
    size === "default" ? "" : size === "large" ? "large" : "profile-avatar";
  const classes = ["avatar", "user-avatar", sizeClass, tone, className]
    .filter(Boolean)
    .join(" ");
  if (mediaId) {
    return (
      <img
        className={classes}
        src={`/api/v1/media/${mediaId}?variant=thumb`}
        alt=""
      />
    );
  }
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "?";
  return (
    <span className={classes} aria-hidden="true">
      {initial}
    </span>
  );
}
