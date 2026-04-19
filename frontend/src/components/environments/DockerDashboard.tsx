import { useState } from "react";
import DockerContainerList from "./DockerContainerList";
import DockerImageList from "./DockerImageList";
import DockerVolumeList from "./DockerVolumeList";
import DockerNetworkList from "./DockerNetworkList";

interface Props {
  environmentId: string;
}

type SubTab = "containers" | "images" | "volumes" | "networks";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "containers", label: "Containers" },
  { key: "images", label: "Images" },
  { key: "volumes", label: "Volumes" },
  { key: "networks", label: "Networks" },
];

export default function DockerDashboard({ environmentId }: Props) {
  const [activeTab, setActiveTab] = useState<SubTab>("containers");

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 border-b border-divider -mx-5 px-5">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-default-500 hover:text-default-700"
            }`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "containers" && <DockerContainerList environmentId={environmentId} />}
      {activeTab === "images" && <DockerImageList environmentId={environmentId} />}
      {activeTab === "volumes" && <DockerVolumeList environmentId={environmentId} />}
      {activeTab === "networks" && <DockerNetworkList environmentId={environmentId} />}
    </div>
  );
}
