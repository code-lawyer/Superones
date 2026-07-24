type ChannelRibbonProps = {
  identity: string;
  slogan: string;
};

export function ChannelRibbon({ identity, slogan }: ChannelRibbonProps) {
  return (
    <div className="channel-ribbon">
      <p className="channel-ribbon__accessible">{identity}: {slogan}</p>
      <div className="shell channel-ribbon__track" aria-hidden="true">
        <span>{identity}:</span>
        <span>{slogan}</span>
      </div>
    </div>
  );
}
