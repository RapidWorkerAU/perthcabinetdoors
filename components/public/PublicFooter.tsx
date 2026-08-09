type PublicFooterProps = {
  className?: string;
  separator?: "dot" | "dash";
};

export default function PublicFooter({ className, separator = "dot" }: PublicFooterProps) {
  const divider = separator === "dash" ? " - " : " \u00a0\u00b7\u00a0 ";

  return (
    <footer className={className}>
      <p>Copyright 2026 Perth Cabinet Doors. All rights reserved.</p>
      <p>
        Perth, Western Australia{divider}
        <a href="tel:0437750990">0437 750 990</a>
        {divider}
        <a href="mailto:sales@perthcabinetdoors.com.au">sales@perthcabinetdoors.com.au</a>
      </p>
    </footer>
  );
}
