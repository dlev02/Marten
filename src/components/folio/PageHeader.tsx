import { Plus } from "lucide-react";
import { Button } from "./ui";

export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      <div className="header-actions">{children}</div>
    </header>
  );
}
export function AddAccountButton({ onClick }: { onClick: () => void }) {
  return (
    <Button tone="primary" icon={<Plus size={16} />} onClick={onClick}>
      Add account
    </Button>
  );
}
