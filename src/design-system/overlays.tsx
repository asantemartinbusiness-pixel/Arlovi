import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ReactNode } from "react";
import { Button } from "./primitives";


/** A press on a toast is not an intent to leave the dialog. */
function fromToast(event: { target: EventTarget | null }): boolean {
  return event.target instanceof Element && Boolean(event.target.closest(".ds-toasts"));
}

/**
 * Modal — one focused decision. Title, consequence copy, a single principal
 * action. Focus is trapped and returned by Radix; Escape always dismisses
 * unless the caller marks the overlay as blocking.
 */
export function Modal({
  open, onOpenChange, title, description, children, footer, width = 560, tone, blocking,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  tone?: "danger";
  blocking?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ds-overlay" />
        <Dialog.Content
          className="ds-modal"
          style={{ ["--modal-w" as string]: `${width}px` }}
          onEscapeKeyDown={(event) => { if (blocking) event.preventDefault(); }}
          onInteractOutside={(event) => { if (blocking || fromToast(event)) event.preventDefault(); }}
        >
          <header className="ds-overlay-head">
            <div className="ds-grow">
              <Dialog.Title asChild><h2 style={tone === "danger" ? { color: "var(--danger)" } : undefined}>{title}</h2></Dialog.Title>
              {description && <Dialog.Description className="ds-card-sub">{description}</Dialog.Description>}
            </div>
            <Dialog.Close asChild><Button variant="ghost" size="sm" iconOnly aria-label="Close">✕</Button></Dialog.Close>
          </header>
          {children !== undefined && <div className="ds-overlay-body">{children}</div>}
          {footer && <footer className="ds-overlay-foot">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Drawer — contextual detail beside the work, keeping the page URL and filters.
 * Collapses to a bottom sheet under 600px.
 */
export function Drawer({
  open, onOpenChange, title, subtitle, children, footer, width = 440, head,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  head?: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="ds-overlay" />
        <Dialog.Content
          className="ds-drawer"
          style={{ ["--drawer-w" as string]: `${width}px` }}
          aria-describedby={undefined}
          onInteractOutside={(event) => { if (fromToast(event)) event.preventDefault(); }}
        >
          <header className="ds-overlay-head">
            <div className="ds-grow">
              <Dialog.Title asChild><h2>{title}</h2></Dialog.Title>
              {subtitle && <div className="ds-card-sub">{subtitle}</div>}
            </div>
            {head}
            <Dialog.Close asChild><Button variant="ghost" size="sm" iconOnly aria-label="Close">✕</Button></Dialog.Close>
          </header>
          <div className="ds-overlay-body">{children}</div>
          {footer && <footer className="ds-overlay-foot">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Popover({ trigger, children, align = "start" }: { trigger: ReactNode; children: ReactNode; align?: "start" | "center" | "end" }) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content className="ds-popover" sideOffset={6} align={align} collisionPadding={12}>
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export interface MenuEntry {
  label: string;
  onSelect?: () => void;
  tone?: "danger";
  disabled?: boolean;
  separatorBefore?: boolean;
  group?: string;
  shortcut?: string;
}

export function Menu({ trigger, items, label, align = "end" }: { trigger: ReactNode; items: MenuEntry[]; label: string; align?: "start" | "end" }) {
  let lastGroup: string | undefined;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="ds-popover" sideOffset={6} align={align} aria-label={label} collisionPadding={12}>
          {items.map((item, index) => {
            const showGroup = item.group && item.group !== lastGroup;
            lastGroup = item.group ?? lastGroup;
            return (
              <div key={`${item.label}-${index}`}>
                {item.separatorBefore && <DropdownMenu.Separator className="ds-menu-sep" />}
                {showGroup && <DropdownMenu.Label className="ds-menu-label">{item.group}</DropdownMenu.Label>}
                <DropdownMenu.Item className="ds-menu-item" data-tone={item.tone} disabled={item.disabled} onSelect={() => item.onSelect?.()}>
                  <span className="ds-grow">{item.label}</span>
                  {item.shortcut && <span className="ds-kbd">{item.shortcut}</span>}
                </DropdownMenu.Item>
              </div>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Confirmation for a consequential, hard-to-reverse local action. */
export function ConfirmModal({
  open, onOpenChange, title, consequence, confirmLabel, onConfirm, tone = "danger", busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  consequence: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  tone?: "danger" | "accent";
  busy?: boolean;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      width={460}
      tone={tone === "danger" ? "danger" : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <span className="ds-grow" />
          <Button variant={tone === "danger" ? "danger" : "primary"} busy={busy} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="ds-prose">{consequence}</p>
    </Modal>
  );
}
