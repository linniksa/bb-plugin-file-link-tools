import { useEffect, useRef, useState } from "react";
import { experimental_Icon as Icon, useRpc } from "@get-bb/plugin-sdk/app";
import { actionFor, actionIcon, builtInActions, configurationSchema, toolIcons, type Configuration } from "./actions";
import type { rpcContract } from "./server";
import { useConfiguration } from "./use-configuration";
import { useLocale } from "./use-locale";
import { settingsMessages } from "./settings-messages";
import { Button } from "./components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./components/ui/tooltip";
import "./settings.css";

type Draft = Omit<Configuration, "rules"> & { rules: { extensions: string; action: string }[] };
const toDraft = (config: Configuration): Draft => ({ ...config, rules: config.rules.map(rule => ({ ...rule, extensions: rule.extensions.join(", ") })) });
const toConfig = (draft: Draft) => ({ ...draft, rules: draft.rules.map(rule => ({ ...rule, extensions: rule.extensions.toLowerCase().split(",").map(ext => ext.trim()).filter(Boolean) })) });

function IconPicker({ value, onChange, label }: { value: Configuration["tools"][number]["icon"]; onChange: (icon: typeof value) => void; label: string }) {
  const details = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  function close() { if (details.current) details.current.open = false; trigger.current?.focus(); }
  return <details className="icon-picker" ref={details} onKeyDown={event => { if (event.key === "Escape") { close(); event.stopPropagation(); } }}>
    <summary ref={trigger} aria-label={`${label}: ${value}`}><Icon name={value} /><Icon name="ChevronDown" className="chevron" /></summary>
    <div className="icon-options" role="group" aria-label={label}>
      {toolIcons.map(icon => <Tooltip key={icon}>
        <TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={icon} aria-pressed={value === icon} onClick={() => { onChange(icon); close(); }}><Icon name={icon} /></Button></TooltipTrigger>
        <TooltipContent>{icon}</TooltipContent>
      </Tooltip>)}
    </div>
  </details>;
}

export function FileLinkSettings() {
  const locale = useLocale();
  const m = settingsMessages(locale);
  const rpc = useRpc<typeof rpcContract>();
  const { config, error, reload } = useConfiguration();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [base, setBase] = useState<Configuration | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [filename, setFilename] = useState("photo.png");
  const dirty = !!draft && JSON.stringify(toConfig(draft)) !== JSON.stringify(base);
  useEffect(() => {
    if (config && !dirty) { setDraft(toDraft(config)); setBase(config); }
  }, [config, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  if (!draft || !config) return <div className="flt-settings" lang={locale}><p role={error ? "alert" : "status"}>{error ?? m.loading}</p>{error && <Button onClick={() => void reload()}>{m.reload}</Button>}</div>;
  const parsed = configurationSchema.safeParse(toConfig(draft));
  const actionLabels = { folder: m.folder, preview: m.preview, external: m.external, ...Object.fromEntries(draft.tools.map(tool => [tool.id, tool.name])) };
  const actionOptions = [...builtInActions, ...draft.tools.map(tool => tool.id)];
  function edit(next: Draft) { setDraft(next); setSaved(false); setSaveError(null); }
  function select(value: string, onChange: (action: string) => void, label: string) {
    return <select id={label === m.defaultAction ? "flt-default" : undefined} value={value} onChange={event => onChange(event.target.value)} aria-label={label}>{actionOptions.map(action => <option key={action} value={action}>{actionLabels[action as keyof typeof actionLabels]}</option>)}</select>;
  }
  const patchTool = (index: number, patch: Partial<Configuration["tools"][number]>) => edit({ ...draft, tools: draft.tools.map((tool, i) => i === index ? { ...tool, ...patch } : tool) });
  async function save() {
    if (!parsed.success) return;
    setBusy(true); setSaveError(null);
    try {
      const next = await rpc.call("saveConfiguration", parsed.data);
      setBase(next); setDraft(toDraft(next)); setSaved(true);
      await reload();
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  const exampleAction = parsed.success ? actionFor(parsed.data, filename) : null;
  const exampleRule = parsed.success ? parsed.data.rules.find(rule => rule.action === exampleAction && rule.extensions.some(ext => filename.toLowerCase().endsWith(ext))) : null;
  return <TooltipProvider><div className="flt-settings" lang={locale}>
    <header><h2>{m.title}</h2><p className="description">{m.intro}</p></header>
    <fieldset disabled={busy}>
      <section><div className="row"><div><h3><label htmlFor="flt-default">{m.defaultAction}</label></h3><p className="description">{m.defaultHint}</p></div><div className="controls">{select(draft.defaultAction, defaultAction => edit({ ...draft, defaultAction }), m.defaultAction)}</div></div></section>
      <section><h3>{m.rules}</h3><p className="description">{m.rulesHint}</p>
        <table><thead><tr><th scope="col">{m.extensions}</th><th scope="col">{m.action}</th><th scope="col"><span className="sr-only">{m.removeRule}</span></th></tr></thead>
          <tbody>{draft.rules.map((rule, index) => <tr key={index}>
            <td><input aria-label={`${m.extensions} ${index + 1}`} value={rule.extensions} spellCheck={false} onChange={event => edit({ ...draft, rules: draft.rules.map((r, i) => i === index ? { ...r, extensions: event.target.value } : r) })} /></td>
            <td>{select(rule.action, action => edit({ ...draft, rules: draft.rules.map((r, i) => i === index ? { ...r, action } : r) }), `${m.action} ${index + 1}`)}</td>
            <td><Button className="delete" variant="ghost" size="icon" aria-label={`${m.removeRule} ${index + 1}`} onClick={() => edit({ ...draft, rules: draft.rules.filter((_, i) => i !== index) })}><Icon name="X" /></Button></td>
          </tr>)}</tbody>
        </table>
        <Button className="add" variant="ghost" disabled={draft.rules.length >= 50} onClick={() => edit({ ...draft, rules: [...draft.rules, { extensions: "", action: draft.defaultAction }] })}><Icon name="Plus" />{m.addRule}</Button>
      </section>
      <section><h3>{m.tools}</h3><p className="description">{m.toolsHint}</p><div className="tools">
        {draft.tools.map((tool, index) => {
          const used = draft.defaultAction === tool.id || draft.rules.some(rule => rule.action === tool.id);
          return <div className="tool" key={tool.id}><div className="tool-grid">
            <label>{m.name}<input value={tool.name} maxLength={80} onChange={event => patchTool(index, { name: event.target.value })} /></label>
            <div className="icon-field"><span>{m.icon}</span><IconPicker value={tool.icon} label={m.chooseIcon} onChange={icon => patchTool(index, { icon })} /></div>
            <Tooltip><TooltipTrigger asChild><span className="delete-wrap"><Button className="delete" variant="ghost" size="icon" aria-label={`${m.removeTool}: ${tool.name}`} disabled={used} onClick={() => edit({ ...draft, tools: draft.tools.filter(t => t.id !== tool.id) })}><Icon name="X" /></Button></span></TooltipTrigger><TooltipContent>{used ? m.usedTool : m.removeTool}</TooltipContent></Tooltip>
          </div><label className="command">{m.command}<input spellCheck={false} value={tool.command} maxLength={4096} onChange={event => patchTool(index, { command: event.target.value })} /></label></div>;
        })}
      </div><Button className="add" variant="ghost" disabled={draft.tools.length >= 50} onClick={() => edit({ ...draft, tools: [...draft.tools, { id: crypto.randomUUID(), name: "", icon: "Terminal", command: "" }] })}><Icon name="Plus" />{m.addTool}</Button><p className="description">{m.commandHint}</p></section>
      <section><h3>{m.check}</h3><p className="description">{m.checkHint}</p><div className="sample"><label htmlFor="flt-filename">{m.filename}</label><input id="flt-filename" value={filename} spellCheck={false} onChange={event => setFilename(event.target.value)} /><div className="result" role="status">
        {parsed.success && exampleAction && <Icon name={actionIcon(parsed.data, exampleAction)} />}
        <div><strong>{exampleAction ? actionLabels[exampleAction as keyof typeof actionLabels] : m.invalid}</strong><small>{exampleRule ? `${m.ruleUsed}: ${exampleRule.extensions.join(", ")}` : m.defaultUsed}</small></div>
      </div></div></section>
    </fieldset>
    {!parsed.success && dirty && <div className="error" role="alert">{m.invalid}: {parsed.error.issues.map(issue => issue.message).join(" · ")}</div>}
    {saveError && <p className="error" role="alert">{saveError}</p>}
    {dirty && JSON.stringify(base) !== JSON.stringify(config) && <p className="error" role="alert">{m.dirty}</p>}
    <div className="footer"><span role="status">{busy ? m.saving : saved ? m.saved : dirty ? m.unsaved : ""}</span><div className="controls"><Button variant="ghost" disabled={!dirty || busy} onClick={() => { setDraft(toDraft(config)); setBase(config); setSaveError(null); }}>{m.cancel}</Button><Button disabled={!dirty || !parsed.success || busy} onClick={() => void save()}>{m.save}</Button></div></div>
  </div></TooltipProvider>;
}
