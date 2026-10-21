/** An item's pictures and audio clips, served from its package's assets. */
export default function Media({ packageId, media }: { packageId: string; media?: { src: string; alt?: string }[] }) {
  if (!media?.length) return null;
  return (
    <div className="work-body">
      {media.map((m) => {
        const url = `/api/packages/${packageId}/${m.src}`;
        return /\.mp3$/i.test(m.src) ? (
          <audio key={m.src} controls src={url} />
        ) : (
          <img key={m.src} src={url} alt={m.alt ?? ""} className="work-media" />
        );
      })}
    </div>
  );
}
