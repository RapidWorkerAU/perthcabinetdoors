import PortalModal from "@/components/PortalModal";
import PublicButton from "./PublicButton";
import type { ReactNode } from "react";

type PublicFilterSheetProps = {
  applyClassName?: string;
  children: ReactNode;
  open: boolean;
  resetClassName?: string;
  resultsLabel: string;
  title?: string;
  onApply: () => void;
  onClose: () => void;
  onReset: () => void;
};

export default function PublicFilterSheet({
  applyClassName,
  children,
  open,
  resetClassName,
  resultsLabel,
  title = "Filters",
  onApply,
  onClose,
  onReset,
}: PublicFilterSheetProps) {
  return (
    <PortalModal
      open={open}
      onClose={onClose}
      ariaLabel={title}
      title={title}
      footer={
        <>
          <PublicButton className={resetClassName} onClick={onReset}>
            Reset all filters
          </PublicButton>
          <PublicButton className={applyClassName} onClick={onApply}>
            {resultsLabel}
          </PublicButton>
        </>
      }
    >
      {children}
    </PortalModal>
  );
}
