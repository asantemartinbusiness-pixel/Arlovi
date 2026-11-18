import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useNavigate } from "react-router-dom";
import {
  Building2, Check, ChevronRight, Database, HelpCircle, History, House,
  Monitor, Moon, Palette, Pin, PinOff, SlidersHorizontal, Sun, UserRound, Users,
} from "lucide-react";
import { Button } from "@/design-system";
import { palettes } from "@/app/brand";
import { ROLE_LABELS } from "@/platform/policy";
import { useWorkspace } from "@/platform/workspace";
import { useUi } from "@/runtime/ui";
import { workAreaPath } from "@/app/WorkspaceNavigation";
import type { Role } from "@/domain/types";
import "./profile-menu.css";

const ROLE_VIEWS: Role[] = ["owner", "finance", "sales", "people", "member", "client"];
const DENSITIES = [
  { value: "comfortable", label: "Spacious" },
  { value: "balanced", label: "Balanced" },
  { value: "compact", label: "Compact" },
] as const;

interface ProfileMenuProps {
  onOpenDisplay: () => void;
  onRoleViewChange: (next: Role) => void;
  onStartTour: () => void;
  activeApplication?: {
    name: string;
    pinned: boolean;
    onToggleFavourite: () => void;
  };
}

/**
 * Personal control centre for a browser-local workspace. This is deliberately
 * not an authentication/profile-management surface: neither the role preview
 * nor the local owner name conveys verified identity or access.
 */
export function ProfileMenu({
  onOpenDisplay, onRoleViewChange, onStartTour, activeApplication,
}: ProfileMenuProps) {
  const { org, role } = useWorkspace();
  const ui = useUi();
  const navigate = useNavigate();
  const displayName = org.ownerName?.trim() || "Local workspace profile";
  const paletteName = palettes.find(item => item.id === ui.palette)?.label ?? "Colour";
  const accountPath = `/o/${org.slug}/workspace/account`;
  const companyPath = workAreaPath(org.slug, "company");
  const peoplePath = `/o/${org.slug}/workspace/people`;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="sm" iconOnly
          aria-label={`Profile and preferences. Local role view ${ROLE_LABELS[role]}`}>
          <span className="hq-profile-avatar"><UserRound size={15} aria-hidden="true"/></span>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="ds-popover profile-menu"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          aria-label="Account and preferences"
        >
          <div className="profile-menu__identity">
            <span className="profile-menu__avatar" aria-hidden="true"><UserRound size={21}/></span>
            <div className="profile-menu__identity-copy">
              <span className="profile-menu__name" title={displayName}>{displayName}</span>
              <span className="profile-menu__company" title={org.name}>{org.name}</span>
              <span className="profile-menu__local">Browser-local workspace</span>
            </div>
          </div>

          <div className="profile-menu__shortcuts" role="group" aria-label="Quick destinations">
            <DropdownMenu.Item className="profile-menu__shortcut"
              onSelect={() => navigate(workAreaPath(org.slug, "home"))}>
              <House size={17} aria-hidden="true" />
              <span>My workspace</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item className="profile-menu__shortcut"
              onSelect={() => navigate(`/o/${org.slug}/workspace/recent`)}>
              <History size={17} aria-hidden="true" />
              <span>Recent & saved</span>
            </DropdownMenu.Item>
          </div>

          <DropdownMenu.Separator className="profile-menu__separator" />
          <DropdownMenu.Label className="profile-menu__label">Workspace & account</DropdownMenu.Label>
          <DropdownMenu.Item className="profile-menu__item" onSelect={() => navigate(accountPath)}>
            <Database size={17} aria-hidden="true" />
            <span className="profile-menu__item-title">Account & data readiness</span>
            <ChevronRight size={15} aria-hidden="true" className="profile-menu__chevron"/>
          </DropdownMenu.Item>
          <DropdownMenu.Item className="profile-menu__item" onSelect={() => navigate(companyPath)}>
            <Building2 size={17} aria-hidden="true" />
            <span className="profile-menu__item-title">Company overview</span>
            <ChevronRight size={15} aria-hidden="true" className="profile-menu__chevron"/>
          </DropdownMenu.Item>
          {role !== "client" && (
            <DropdownMenu.Item className="profile-menu__item" onSelect={() => navigate(peoplePath)}>
              <Users size={17} aria-hidden="true"/>
              <span className="profile-menu__item-title">People & collaboration</span>
              <ChevronRight size={15} aria-hidden="true" className="profile-menu__chevron"/>
            </DropdownMenu.Item>
          )}
          {org.ownerName && (
            <DropdownMenu.Item className="profile-menu__item"
              onSelect={() => navigate(`/o/${org.slug}/hq/home?gettingStarted=1`)}>
              <Check size={17} aria-hidden="true"/>
              <span className="profile-menu__item-title">Review company setup</span>
              <ChevronRight size={15} aria-hidden="true" className="profile-menu__chevron"/>
            </DropdownMenu.Item>
          )}
          {activeApplication && (
            <DropdownMenu.Item className="profile-menu__item" onSelect={activeApplication.onToggleFavourite}>
              {activeApplication.pinned
                ? <PinOff size={17} aria-hidden="true"/>
                : <Pin size={17} aria-hidden="true"/>}
              <span className="profile-menu__item-title">
                {activeApplication.pinned ? "Unpin" : "Pin"} {activeApplication.name} {activeApplication.pinned ? "from" : "to"} favourites
              </span>
            </DropdownMenu.Item>
          )}

          <DropdownMenu.Separator className="profile-menu__separator" />
          <DropdownMenu.Label className="profile-menu__label">Personal preferences</DropdownMenu.Label>
          <DropdownMenu.Item className="profile-menu__item" onSelect={onOpenDisplay}>
            <Monitor size={17} aria-hidden="true" />
            <span className="profile-menu__item-title">Display & scaling</span>
            <span className="profile-menu__value">{ui.interfaceScale}%</span>
          </DropdownMenu.Item>
          <DropdownMenu.CheckboxItem
            className="profile-menu__item"
            checked={ui.theme === "dark"}
            onCheckedChange={checked => ui.setTheme(checked ? "dark" : "light")}
            onSelect={event => event.preventDefault()}
          >
            {ui.theme === "light" ? <Sun size={17} aria-hidden="true"/> : <Moon size={17} aria-hidden="true"/>}
            <span className="profile-menu__item-title">Dark appearance</span>
            <span className="profile-menu__value">{ui.theme === "dark" ? "On" : "Off"}</span>
          </DropdownMenu.CheckboxItem>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="profile-menu__item">
              <SlidersHorizontal size={17} aria-hidden="true"/>
              <span className="profile-menu__item-title">Interface density</span>
              <span className="profile-menu__value">{DENSITIES.find(item => item.value === ui.density)?.label}</span>
              <ChevronRight size={15} aria-hidden="true" className="profile-menu__chevron"/>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent className="ds-popover profile-menu__sub" sideOffset={8} collisionPadding={12}>
                <DropdownMenu.Label className="profile-menu__label">Interface density</DropdownMenu.Label>
                <DropdownMenu.RadioGroup value={ui.density}
                  onValueChange={value => ui.setDensity(value as typeof ui.density)}>
                  {DENSITIES.map(item => (
                    <DropdownMenu.RadioItem key={item.value} value={item.value}
                      className="profile-menu__item" onSelect={event => event.preventDefault()}>
                      <span className="profile-menu__item-title">{item.label}</span>
                      {ui.density === item.value && <Check size={15} aria-hidden="true" className="profile-menu__selection"/>}
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
                <p className="profile-menu__hint">Changes spacing, independently of display scaling.</p>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="profile-menu__item">
              <Palette size={17} aria-hidden="true"/>
              <span className="profile-menu__item-title">Colour palette</span>
              <span className="profile-menu__value profile-menu__value--short">{paletteName}</span>
              <ChevronRight size={15} aria-hidden="true" className="profile-menu__chevron"/>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent className="ds-popover profile-menu__sub" sideOffset={8} collisionPadding={12}>
                <DropdownMenu.Label className="profile-menu__label">Personal colour preference</DropdownMenu.Label>
                <DropdownMenu.RadioGroup value={ui.palette}
                  onValueChange={value => ui.setPalette(value as typeof ui.palette)}>
                  {palettes.map(item => (
                    <DropdownMenu.RadioItem key={item.id} value={item.id}
                      className="profile-menu__item" onSelect={event => event.preventDefault()}>
                      <span className="profile-menu__item-title">{item.label}</span>
                      {ui.palette === item.id && <Check size={15} aria-hidden="true" className="profile-menu__selection"/>}
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
                <p className="profile-menu__hint">Saved in this browser, not as a company-wide brand change.</p>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>

          <DropdownMenu.Separator className="profile-menu__separator" />
          <DropdownMenu.Label className="profile-menu__label">Role view (not a security boundary)</DropdownMenu.Label>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="profile-menu__item">
              <UserRound size={17} aria-hidden="true"/>
              <span className="profile-menu__item-title">Preview as {ROLE_LABELS[role]}</span>
              <span className="profile-menu__value">Local</span>
              <ChevronRight size={15} aria-hidden="true" className="profile-menu__chevron"/>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent className="ds-popover profile-menu__sub" sideOffset={8} collisionPadding={12}>
                <DropdownMenu.Label className="profile-menu__label">Preview navigation as</DropdownMenu.Label>
                <DropdownMenu.RadioGroup value={role} onValueChange={value => onRoleViewChange(value as Role)}>
                  {ROLE_VIEWS.map(item => (
                    <DropdownMenu.RadioItem className="profile-menu__item" key={item} value={item}>
                      <span className="profile-menu__item-title">{ROLE_LABELS[item]}</span>
                      {item === role && <Check size={15} aria-hidden="true" className="profile-menu__selection"/>}
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
                <p className="profile-menu__hint">Preview only. It does not change account permissions or grant access.</p>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>

          <DropdownMenu.Separator className="profile-menu__separator" />
          <DropdownMenu.Item className="profile-menu__item" onSelect={onStartTour}>
            <HelpCircle size={17} aria-hidden="true"/>
            <span className="profile-menu__item-title">Take a guided tour</span>
            <ChevronRight size={15} aria-hidden="true" className="profile-menu__chevron"/>
          </DropdownMenu.Item>
          <div className="profile-menu__foot" role="note">
            <span className="profile-menu__foot-dot" aria-hidden="true"/>
            <span>Local mode · Cloud account not connected</span>
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
