import { useState } from "react";
import { Notice, Pill, Row, Segmented, Stack } from "@/design-system";
import { COLLAPSE_BELOW, DEVICES, layoutNotes, layoutRows, type Device } from "./layout";

/**
 * A schematic of the screen at a device width, packed by layoutRows. Each
 * box is a component; its width is its computed span, not a guess.
 */
export function DeviceLayoutPreview({ components }: { components: { id: string; title: string; span: number }[] }) {
  const [device, setDevice] = useState<Device>("desktop");
  const width = DEVICES[device].width;
  const rows = layoutRows(components, width);
  const notes = layoutNotes(components, width);
  return (
    <section className="build-device" aria-label="Responsive layout preview">
      <Row gap={3} wrap>
        <Segmented label="Preview width" value={device} onChange={setDevice}
          options={(Object.keys(DEVICES) as Device[]).map((key) => ({ value: key, label: `${DEVICES[key].label} ${DEVICES[key].width}` }))} />
        <Pill tone={width < COLLAPSE_BELOW ? "warning" : "info"}>{width < COLLAPSE_BELOW ? "Single column" : "Twelve columns"}</Pill>
      </Row>
      <div className="build-device-stage">
        <div className="build-device-frame" data-device={device} style={{ width: `min(100%, ${device === "desktop" ? 100 : device === "tablet" ? 60 : 32}%)` }}
          aria-label={`${DEVICES[device].label} layout, ${rows.length} rows`}>
          {rows.length === 0 ? <p className="ds-subtle">No components on this screen.</p> : rows.map((row, index) => (
            <div key={index} className="build-device-row">
              {row.map((item) => (
                <div key={item.id} className="build-device-box" style={{ gridColumn: `${item.column} / span ${item.span}` }}>
                  <strong>{item.title}</strong>
                  <span>{item.span}/12</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <Stack gap={2}>
        {notes.map((note) => <Notice key={note} tone="info">{note}</Notice>)}
      </Stack>
    </section>
  );
}
