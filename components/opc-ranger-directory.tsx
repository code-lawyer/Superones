import Link from "next/link";
import type { RangerProfile } from "@/lib/opc-catalog";

export function OpcRangerDirectory({ profiles }: { profiles: RangerProfile[] }) {
  return (
    <div className="opc-ranger-directory">
      {profiles.map((profile) => (
        <Link className="opc-ranger-record" id={profile.slug} href={`/opc/rangers/${profile.slug}`} key={profile.slug}>
          <span className="opc-ranger-record__identity mono">{profile.identity}</span>
          <strong className="opc-ranger-record__name">{profile.publicName}</strong>
          <span className="opc-ranger-record__intro">{profile.intro}</span>
          <span className="opc-ranger-record__open mono">查看档案 ↗</span>
        </Link>
      ))}
    </div>
  );
}
