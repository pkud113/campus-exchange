export function RoleColorSwatch({ color }: { color: string }) {
  return <svg className="role-color" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <circle cx="8" cy="8" r="8" fill={color} />
  </svg>;
}
