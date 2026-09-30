"use client";

import { defaultHomeContent, homeContentSchema, type HomeContent } from "@basny-web/api/content/home";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import { client } from "@/utils/orpc";

const images = [
  { value: "/images/hero/sandals-shoulder-bag.png", label: "Sandals and shoulder bag" },
  { value: "/images/hero/heels-getting-ready.png", label: "Heels and burgundy bag" },
  { value: "/images/hero/flats-tote-clutch.png", label: "Flats, tote and clutch" },
] as const;

function Field({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return <label className="content-admin__field"><span>{label}</span>{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} /> : <input value={value} onChange={(event) => onChange(event.target.value)} />}</label>;
}

export default function ContentEditor() {
  const [content, setContent] = useState<HomeContent>(defaultHomeContent);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState("Loading content…");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [allowed, setAllowed] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [conflict, setConflict] = useState(false);

  const loadDraft = useCallback(async () => {
    setBusy(true);
    setLoaded(false);
    setLoadError(false);
    setConflict(false);
    setStatus("Loading saved homepage content…");
    try {
      const result = await client.homeContentDraft();
      setContent(result.content);
      setRevision(result.revision);
      setDirty(false);
      setConflict(false);
      setStatus("Edit the draft, then save and publish when it is ready.");
      setLoaded(true);
      setAllowed(true);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("FORBIDDEN")) {
        setAllowed(false);
        setStatus("This account cannot edit homepage content. Ask the owner to grant your account a staff role.");
      } else {
        setLoadError(true);
        setStatus("Could not load saved homepage content. Retry before editing so a default copy cannot overwrite the draft.");
      }
    } finally {
      setLoaded(true);
      setBusy(false);
    }
  }, []);

  useEffect(() => { void loadDraft(); }, [loadDraft]);

  function updateSlide(index: number, field: keyof HomeContent["slides"][number], value: string) {
    setDirty(true);
    setContent((current) => ({ ...current, slides: current.slides.map((slide, slideIndex) => slideIndex === index ? { ...slide, [field]: value } : slide) }));
  }

  function updateEditorial(field: keyof HomeContent["editorial"], value: string) {
    setDirty(true);
    setContent((current) => ({ ...current, editorial: { ...current.editorial, [field]: value } }));
  }

  async function save() {
    const parsed = homeContentSchema.safeParse(content);
    if (!parsed.success) {
      setStatus(`Check ${parsed.error.issues[0]?.path.join(" → ")}: ${parsed.error.issues[0]?.message}`);
      return;
    }
    setBusy(true);
    try {
      const result = await client.saveHomeContentDraft({ content: parsed.data, revision });
      setRevision(result.revision);
      setConflict(false);
      setDirty(false);
      setStatus("Draft saved. The storefront still shows the published version.");
    } catch (error) {
      const conflicted = error instanceof Error && /conflict|changed in another session/i.test(error.message);
      setConflict(conflicted);
      setStatus(conflicted ? "Another editor changed the homepage draft. Reload the latest version before continuing." : "Draft save failed. Your local edits remain here; check the connection and retry.");
    } finally { setBusy(false); }
  }

  async function publish() {
    setBusy(true);
    try {
      const result = await client.publishHomeContent({ revision });
      setRevision(result.revision);
      setConflict(false);
      setStatus("Published. The storefront now shows these changes.");
    } catch (error) {
      const conflicted = error instanceof Error && /conflict|changed in another session/i.test(error.message);
      setConflict(conflicted);
      setStatus(conflicted ? "Another editor changed the homepage draft. Reload the latest version before publishing." : "Publish failed. The published homepage was not changed; retry after checking the connection.");
    } finally { setBusy(false); }
  }

  return <>
    <div className="content-admin__heading"><div><p className="eyebrow">BASNY admin</p><h1>Homepage content</h1><p>Edit campaign copy, links and imagery.</p></div><Link href="/">View storefront ↗</Link></div>
    <p className="content-admin__status" role="status">{status}</p>
    {busy && !loaded ? <section className="content-admin__panel" aria-busy="true" aria-label="Loading homepage content"><h2>Loading the saved draft</h2><div className="ops-skeleton-line" /><div className="ops-skeleton-line" /><div className="ops-skeleton-line" /></section> : loadError ? <section className="content-admin__panel" role="alert"><h2>Homepage content could not be loaded</h2><p>The saved content is safe. Reconnect, then retry before making changes.</p><button type="button" onClick={() => void loadDraft()} disabled={busy}>{busy ? "Retrying…" : "Retry loading content"}</button></section> : !allowed ? null : <>
    {content.slides.map((slide, index) => <section className="content-admin__panel" key={index}>
      <h2>Hero slide {index + 1}</h2>
      <div className="content-admin__grid">
        <Field label="Eyebrow" value={slide.eyebrow} onChange={(value) => updateSlide(index, "eyebrow", value)} />
        <Field label="Headline" value={slide.title} onChange={(value) => updateSlide(index, "title", value)} />
        <Field label="Description" value={slide.description} onChange={(value) => updateSlide(index, "description", value)} multiline />
        <label className="content-admin__field"><span>Image</span><select value={slide.image} onChange={(event) => updateSlide(index, "image", event.target.value)}>{images.map((image) => <option key={image.value} value={image.value}>{image.label}</option>)}</select></label>
        <div className="content-admin__preview"><Image src={slide.image} alt="" fill sizes="(max-width: 700px) 100vw, 45vw" /></div>
        <Field label="Image description" value={slide.alt} onChange={(value) => updateSlide(index, "alt", value)} />
        <Field label="Primary button text" value={slide.primaryLabel} onChange={(value) => updateSlide(index, "primaryLabel", value)} />
        <Field label="Primary link" value={slide.primaryHref} onChange={(value) => updateSlide(index, "primaryHref", value)} />
        <Field label="Secondary button text" value={slide.secondaryLabel} onChange={(value) => updateSlide(index, "secondaryLabel", value)} />
        <Field label="Secondary link" value={slide.secondaryHref} onChange={(value) => updateSlide(index, "secondaryHref", value)} />
      </div>
    </section>)}
    <section className="content-admin__panel"><h2>Editorial feature</h2><div className="content-admin__grid">
      <Field label="Eyebrow" value={content.editorial.eyebrow} onChange={(value) => updateEditorial("eyebrow", value)} />
      <Field label="Headline" value={content.editorial.title} onChange={(value) => updateEditorial("title", value)} />
      <Field label="Description" value={content.editorial.description} onChange={(value) => updateEditorial("description", value)} multiline />
      <label className="content-admin__field"><span>Image</span><select value={content.editorial.image} onChange={(event) => updateEditorial("image", event.target.value)}>{images.map((image) => <option key={image.value} value={image.value}>{image.label}</option>)}</select></label>
      <div className="content-admin__preview"><Image src={content.editorial.image} alt="" fill sizes="(max-width: 700px) 100vw, 45vw" /></div>
      <Field label="Image description" value={content.editorial.alt} onChange={(value) => updateEditorial("alt", value)} />
      <Field label="Link text" value={content.editorial.linkLabel} onChange={(value) => updateEditorial("linkLabel", value)} />
      <Field label="Link destination" value={content.editorial.linkHref} onChange={(value) => updateEditorial("linkHref", value)} />
    </div></section>
    <div className="content-admin__actions"><button type="button" onClick={save} disabled={busy || !loaded || !dirty || conflict}>Save draft</button><button type="button" onClick={publish} disabled={busy || !loaded || revision === 0 || dirty || conflict}>Publish saved draft</button></div>
    {conflict && <button className="admin-secondary-button" type="button" onClick={() => void loadDraft()} disabled={busy}>Reload latest draft</button>}
    </>}
  </>;
}
