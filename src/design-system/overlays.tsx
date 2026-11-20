import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./primitives";


/**
 * Use in app-owned form footers for Cancel. Radix routes the close request
 * through the existing dirty/in-flight guard, unlike calling close() directly.
 * Successful mutations can still call their supplied close() callback.
 */
export function OverlayCancel({
  children = "Cancel", disabled = false,
}: { children?: ReactNode; disabled?: boolean }) {
  return (
    <Dialog.Close asChild>
      <Button variant="ghost" disabled={disabled}>{children}</Button>
    </Dialog.Close>
  );
}


/** Initial focus: first body field, else first non-close footer button, else the panel. */
function focusInitial(event: Event, mode: "body" | "cancel" = "body") {
  const panel = event.currentTarget as HTMLElement | null;
  if (!panel) return;
  event.preventDefault();
  const enabled = (el: Element | null) => (el instanceof HTMLElement ? el : null);
  let target: HTMLElement | null = null;
  if (mode === "cancel") {
    target = enabled(Array.from(panel.querySelectorAll(".ds-overlay-foot button:not([disabled])"))
      .find(el => /^cancel$/i.test(el.textContent?.trim() ?? "")) ?? null);
  }
  target ??= enabled(panel.querySelector(
    ".ds-overlay-body :is(input:not([type=hidden]), select, textarea, [contenteditable=true]):not([disabled])"));
  target ??= enabled(panel.querySelector(".ds-overlay-foot button:not([disabled])"));
  (target ?? panel).focus({ preventScroll: true });
}

/** A press on a toast is not an intent to leave the dialog. */
function fromToast(event: { target: EventTarget | null }): boolean {
  return event.target instanceof Element && Boolean(event.target.closest(".ds-toasts"));
}

/**
 * Application modals use a stable heading, scrollable work area, and one
 * persistent action region. Existing footer props remain supported.
 */
const ModalFooterTarget = createContext<HTMLElement | null>(null);
const ModalDirtyRegistrar = createContext<((dirty: boolean) => void) | null>(null);
const ModalBusyRegistrar = createContext<((busy: boolean) => void) | null>(null);
/** Current in-flight state of the enclosing Modal/Drawer (read by OverlayActions). */
const OverlayBusyState = createContext(false);
export function useOverlayInFlight(): boolean { return useContext(OverlayBusyState); }

/** Portal form actions into the modal footer without changing overlay contracts. */
export function ModalActions({ children }: { children: ReactNode }) {
  const target = useContext(ModalFooterTarget);
  const actions = <div className="ds-modal-action-row">{children}</div>;
  return target ? createPortal(actions, target) : actions;
}

/** Opt-in dirty guard for editable forms; parent controls final save and close. */
export function ModalUnsavedChanges({ when }: { when: boolean }) {
  const register = useContext(ModalDirtyRegistrar);
  useEffect(() => {
    register?.(when);
    return () => register?.(false);
  }, [register, when]);
  return null;
}

/** Prevent dismissal while an asynchronous modal operation is underway. */
export function ModalInFlight({ when }: { when: boolean }) {
  const register = useContext(ModalBusyRegistrar);
  useEffect(() => {
    register?.(when);
    return () => register?.(false);
  }, [register, when]);
  return null;
}

/**
 * Modal — one focused transaction or decision. Radix manages keyboard focus,
 * Escape and focus return. Dismissal of edited forms requires confirmation.
 */
export function Modal({
  open, onOpenChange, title, description, children, footer, width = 560, tone, blocking, origin, head, application, initialFocus = "body",
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
  origin?: ReactNode;
  head?: ReactNode;
  application?: string;
  initialFocus?: "body" | "cancel";
}) {
  const [footerTarget, setFooterTarget] = useState<HTMLElement | null>(null);
  const [isDirty, setDirty] = useState(false);
  const [inFlight, setInFlight] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const requestOpenChange = (next: boolean) => {
    if (!next && (blocking || inFlight)) return;
    if (!next && isDirty) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(next);
  };

  return (
    <ModalDirtyRegistrar.Provider value={setDirty}>
      <ModalBusyRegistrar.Provider value={setInFlight}>
      <OverlayBusyState.Provider value={inFlight}>
      <ModalFooterTarget.Provider value={footerTarget}>
        <Dialog.Root open={open} onOpenChange={requestOpenChange}>
          <Dialog.Portal>
            <Dialog.Overlay className="ds-overlay" />
            <Dialog.Content
              className="ds-modal"
              {...(description ? {} : { "aria-describedby": undefined })}
              data-native-app={application}
              style={{ ["--modal-w" as string]: `${width}px` }}
              onOpenAutoFocus={(event) => focusInitial(event, initialFocus)}
              onEscapeKeyDown={(event) => { if (blocking || inFlight) event.preventDefault(); }}
              onInteractOutside={(event) => { if (blocking || inFlight || fromToast(event)) event.preventDefault(); }}
            >
              <header className="ds-overlay-head">
                <div className="ds-grow">
                  {origin}
                  <Dialog.Title asChild>
                    <h2 style={tone === "danger" ? { color: "var(--danger)" } : undefined}>{title}</h2>
                  </Dialog.Title>
                  {description
                    ? <Dialog.Description className="ds-card-sub">{description}</Dialog.Description>
                    : null}
                </div>
                {head}
                <Dialog.Close asChild>
                  <Button variant="ghost" size="sm" iconOnly aria-label="Close" title="Close dialog" disabled={blocking || inFlight}>
                    <X size={16} aria-hidden="true" />
                  </Button>
                </Dialog.Close>
              </header>
              {children !== undefined && <div className="ds-overlay-body">{children}</div>}
              <footer className="ds-overlay-foot ds-modal-foot" ref={setFooterTarget}>{footer}</footer>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <Dialog.Root open={confirmDiscard} onOpenChange={setConfirmDiscard}>
          <Dialog.Portal>
            <Dialog.Overlay className="ds-overlay ds-discard-overlay" />
            <Dialog.Content className="ds-modal ds-discard-modal" aria-describedby={undefined}>
              <header className="ds-overlay-head">
                <div className="ds-grow">
                  <Dialog.Title asChild><h2>Discard unsaved changes?</h2></Dialog.Title>
                  <Dialog.Description className="ds-card-sub">The edits in this dialog have not been saved.</Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <Button variant="ghost" iconOnly size="sm" aria-label="Keep editing"><X size={16} aria-hidden="true" /></Button>
                </Dialog.Close>
              </header>
              <div className="ds-overlay-body">
                <p className="ds-prose">You can return later, but these changes will be lost.</p>
              </div>
              <footer className="ds-overlay-foot ds-modal-foot">
                <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
                <span className="ds-grow" />
                <Button variant="danger" onClick={() => { setConfirmDiscard(false); onOpenChange(false); }}>Discard changes</Button>
              </footer>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </ModalFooterTarget.Provider>
      </OverlayBusyState.Provider>
      </ModalBusyRegistrar.Provider>
    </ModalDirtyRegistrar.Provider>
  );
}

/**
 * An application drawer has three regions: stable context, scrollable work,
 * and durable actions. Existing `footer` definitions still work; screens
 * can opt into the shared action dock without changing their registry.
 */
const DrawerFooterTarget = createContext<HTMLElement | null>(null);
const DrawerDirtyRegistrar = createContext<((dirty: boolean) => void) | null>(null);
const DrawerBusyRegistrar = createContext<((busy: boolean) => void) | null>(null);

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

/** Prevent a pending native drawer mutation being dismissed through Escape or the scrim. */
export function DrawerInFlight({ when }: { when: boolean }) {
  const register = useContext(DrawerBusyRegistrar);
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
  open, onOpenChange, title, subtitle, children, footer, width = 440, head, origin, application,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  head?: ReactNode;
  origin?: ReactNode;
  application?: string;
}) {
  const [footerTarget, setFooterTarget] = useState<HTMLElement | null>(null);
  const [isDirty, setDirty] = useState(false);
  const [inFlight, setInFlight] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const requestOpenChange = (next: boolean) => {
    if (!next && inFlight) return;
    if (!next && isDirty) {
      setConfirmDiscard(true);
      return;
    }
    onOpenChange(next);
  };

  return (
    <DrawerDirtyRegistrar.Provider value={setDirty}>
      <DrawerBusyRegistrar.Provider value={setInFlight}>
      <OverlayBusyState.Provider value={inFlight}>
      <DrawerFooterTarget.Provider value={footerTarget}>
        <Dialog.Root open={open} onOpenChange={requestOpenChange}>
          <Dialog.Portal>
            <Dialog.Overlay className="ds-overlay ds-drawer-scrim" />
            <Dialog.Content
              className="ds-drawer"
              {...(subtitle ? {} : { "aria-describedby": undefined })}
              data-native-app={application}
              style={{ ["--drawer-w" as string]: `${width}px` }}
              onOpenAutoFocus={(event) => focusInitial(event)}
              onEscapeKeyDown={(event) => { if (inFlight) event.preventDefault(); }}
              onInteractOutside={(event) => { if (inFlight || fromToast(event)) event.preventDefault(); }}
            >
              <header className="ds-overlay-head">
                <div className="ds-grow">
                  {origin}
                  <Dialog.Title asChild><h2>{title}</h2></Dialog.Title>
                  {subtitle
                    ? <Dialog.Description className="ds-card-sub">{subtitle}</Dialog.Description>
                    : null}
                </div>
                {head}
                <Dialog.Close asChild>
                  <Button variant="ghost" size="sm" iconOnly aria-label="Close panel" disabled={inFlight}>
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
          width={400}
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
      </OverlayBusyState.Provider>
      </DrawerBusyRegistrar.Provider>
    </DrawerDirtyRegistrar.Provider>
  );
}

export function Popover({ trigger, children, align = "start" }: { trigger: ReactNode; children: ReactNode; align?: "start" | "center" | "end" }) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content className="ds-popover" sideOffset={6} align={align} collisionPadding={12} avoidCollisions>
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
  /** Optional leading icon (rendered at 16px, muted). */
  icon?: ReactNode;
  /** Optional one-line secondary text under the label. */
  description?: string;
}

export function Menu({ trigger, items, label, align = "end" }: { trigger: ReactNode; items: MenuEntry[]; label: string; align?: "start" | "end" }) {
  let lastGroup: string | undefined;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="ds-popover ds-menu" sideOffset={6} align={align} aria-label={label} collisionPadding={12} avoidCollisions>
          {items.map((item, index) => {
            const showGroup = item.group && item.group !== lastGroup;
            lastGroup = item.group ?? lastGroup;
            return (
              <div key={`${item.label}-${index}`}>
                {item.separatorBefore && <DropdownMenu.Separator className="ds-menu-sep" />}
                {showGroup && <DropdownMenu.Label className="ds-menu-label">{item.group}</DropdownMenu.Label>}
                <DropdownMenu.Item className="ds-menu-item" data-tone={item.tone} data-has-description={item.description ? "true" : undefined} disabled={item.disabled} onSelect={() => item.onSelect?.()}>
                  {item.icon && <span className="ds-menu-icon" aria-hidden="true">{item.icon}</span>}
                  <span className="ds-grow ds-menu-text">
                    <span className="ds-menu-label-text">{item.label}</span>
                    {item.description && <span className="ds-menu-desc">{item.description}</span>}
                  </span>
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
      initialFocus="cancel"
      tone={tone === "danger" ? "danger" : undefined}
      blocking={busy}
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
