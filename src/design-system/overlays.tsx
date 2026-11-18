import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
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
 * An application drawer has three regions: stable context, scrollable work,
 * and durable actions. Existing `footer` definitions still work; screens
 * can opt into the shared action dock without changing their registry.
 */
const DrawerFooterTarget = createContext<HTMLElement | null>(null);
const DrawerDirtyRegistrar = createContext<((dirty: boolean) => void) | null>(null);

/** Place this inside drawer content to dock its actions below the scroll region. */
export function DrawerActions({ children }: { children: ReactNode }) {
  const target = useContext(DrawerFooterTarget);
  const actions = <div className="ds-drawer-action-row">{children}</div>;
  return target ? createPortal(actions, target) : actions;
}

/** Protect an edited form from Escape, outside clicks, and the close button. */
export function DrawerUnsavedChanges({ when }: { when: boolean }) {
  const register = useContext(DrawerDirtyRegistrar);
  useEffect(() => {
    register?.(when);
    return () => register?.(false);
  }, [register, when]);
  return null;
}

/**
 * Drawer — contextual detail beside the work, keeping the page URL and filters.
 * Focus stays trapped by Radix and returns to the invoking control after close.
 * At narrow viewport widths the same content becomes a bottom sheet.
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
  const [footerTarget, setFooterTarget] = useState<HTMLElement | null>(null);
  const [isDirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const requestOpenChange = (next: boolean) => {
    if (!next && isDirty) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(next);
  };

  return (
    <DrawerDirtyRegistrar.Provider value={setDirty}>
      <DrawerFooterTarget.Provider value={footerTarget}>
        <Dialog.Root open={open} onOpenChange={requestOpenChange}>
          <Dialog.Portal>
            <Dialog.Overlay className="ds-overlay ds-drawer-scrim" />
            <Dialog.Content
              className="ds-drawer"
              style={{ ["--drawer-w" as string]: `${width}px` }}
              onInteractOutside={(event) => { if (fromToast(event)) event.preventDefault(); }}
            >
              <header className="ds-overlay-head">
                <div className="ds-grow">
                  <Dialog.Title asChild><h2>{title}</h2></Dialog.Title>
                  {subtitle
                    ? <Dialog.Description className="ds-card-sub">{subtitle}</Dialog.Description>
                    : <Dialog.Description className="ds-overlay-visually-hidden">Review details and available actions in this panel.</Dialog.Description>}
                </div>
                {head}
                <Dialog.Close asChild>
                  <Button variant="ghost" size="sm" iconOnly aria-label="Close panel">
                    <X size={16} aria-hidden="true" />
                  </Button>
                </Dialog.Close>
              </header>
              <div className="ds-overlay-body">{children}</div>
              <footer className="ds-overlay-foot ds-drawer-foot" ref={setFooterTarget}>{footer}</footer>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <Modal
          open={confirmDiscard}
          onOpenChange={setConfirmDiscard}
          title="Discard unsaved changes?"
          description="Your edits in this panel have not been saved."
          width={440}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
              <span className="ds-grow" />
              <Button variant="danger" onClick={() => { setConfirmDiscard(false); onOpenChange(false); }}>Discard changes</Button>
            </>
          }
        >
          <p className="ds-prose">You can return to this record, but the changes you just made will be lost.</p>
        </Modal>
      </DrawerFooterTarget.Provider>
    </DrawerDirtyRegistrar.Provider>
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
