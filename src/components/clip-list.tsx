import { useState, useMemo } from "react";
import {
  Play,
  Edit,
  Trash2,
  RefreshCw,
  Clock,
  Calendar,
  Film,
} from "lucide-react";
import { ClipMarker } from "@/types/app";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import logger from "@/utils/logger";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { useDisclosure } from "@/hooks/use-disclosure";

interface ClipListProps {
  clips: ClipMarker[];
  onEditClip: (clip: ClipMarker) => void;
  onRefresh: () => Promise<void>;
}

type SortMode = "newest" | "oldest" | "duration";

export default function ClipList({
  clips,
  onEditClip,
  onRefresh,
}: ClipListProps) {
  const [sortBy, setSortBy] = useState<SortMode>("newest");
  const [filterText, setFilterText] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [clipToDelete, setClipToDelete] = useState<ClipMarker | null>(null);

  const {
    isOpen: isDeleteConfirmModalOpen,
    open: openDeleteConfirmModal,
    close: closeDeleteConfirmModal,
  } = useDisclosure();

  const sortedAndFilteredClips = useMemo(() => {
    return clips
      .filter((clip: ClipMarker) => {
        if (!filterText) return true;
        return clip.id.toLowerCase().includes(filterText.toLowerCase());
      })
      .sort((a: ClipMarker, b: ClipMarker) => {
        switch (sortBy) {
          case "newest":
            return b.markedAt - a.markedAt;
          case "oldest":
            return a.markedAt - b.markedAt;
          case "duration":
            return b.endTime - b.startTime - (a.endTime - a.startTime);
          default:
            return 0;
        }
      });
  }, [clips, filterText, sortBy]);

  const handleRefresh = async () => {
    setIsLoading(true);
    await onRefresh();
    setIsLoading(false);
  };

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (startTime: number, endTime: number): string => {
    const duration = (endTime - startTime) / 1000;
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const getRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "Just now";
  };

  const handleDeleteConfirm = () => {
    if (clipToDelete) {
      logger.log("Deleting clip:", clipToDelete.id);
      toast.info(
        `Dummy delete for clip ${clipToDelete.id.split("_")[1]} triggered.`
      );
     
      setClipToDelete(null);
      closeDeleteConfirmModal();
    }
  };

  return (
    <div className="space-y-6 p-4 bg-surface-primary min-h-screen text-foreground-default font-sans text-sm">
      <div className="max-w-screen-xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-extrabold text-foreground-default tracking-tight">
            Recorded Clips
          </h2>
          <Button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center space-x-2 transform hover:-translate-y-0.5 px-3 py-1.5 text-xs"
            variant="default"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            <span className="text-xs font-medium">Refresh</span>
          </Button>
        </div>

        <div className="bg-surface-secondary rounded-lg shadow-sm p-4 border border-gray-700/50 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0 md:space-x-4">
            <div className="flex-1">
              <Input
                autoFocus
                type="text"
                placeholder="Filter clips..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="text-xs px-3 py-1.5"
              />
            </div>

            <div className="flex items-center space-x-2">
              <label className="text-xs font-medium text-foreground-subtle">
                Sort by:
              </label>
              <Select
                value={sortBy}
                onValueChange={(value) => setSortBy(value as SortMode)}
              >
                <SelectTrigger className="text-xs px-3 py-1.5 h-auto">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="duration">Duration</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {sortedAndFilteredClips.length === 0 ? (
          <div className="bg-surface-secondary rounded-lg shadow-sm p-8 text-center border border-gray-700/50">
            <div className="text-foreground-muted text-base font-semibold mb-3 flex items-center justify-center space-x-2">
              <Film size={20} className="text-foreground-muted" />
              <span>No clips found</span>
            </div>
            <div className="text-foreground-subtle text-sm leading-relaxed">
              {clips.length === 0
                ? "Start recording and press "
                : "Try adjusting your search filter or refreshing the list."}
              {clips.length === 0 && (
                <kbd className="px-2 py-0.5 bg-surface-tertiary rounded-sm text-xs font-bold tracking-wide border border-gray-700/50 shadow-xs">
                  Ctrl+Shift+M
                </kbd>
              )}{" "}
              {clips.length === 0 && "to mark interesting moments."}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedAndFilteredClips.map((clip: ClipMarker) => (
              <div
                key={clip.id}
                className="bg-surface-secondary rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-all duration-300 ease-in-out transform hover:-translate-y-1 group relative border border-gray-800/50 hover:border-primary/50"
              >
                <div className="aspect-video bg-surface-tertiary relative flex items-center justify-center border-b border-gray-800/50">
                  <div className="absolute inset-0 bg-gradient-to-br from-surface-primary/50 to-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <Play
                      size={48}
                      className="text-primary opacity-90 group-hover:scale-110 transition-transform duration-300"
                    />
                  </div>
                  <div className="absolute top-2 right-2 bg-black/70 text-foreground-on-accent text-xs px-2.5 py-1 rounded-md font-mono flex items-center space-x-1 border border-gray-700/50">
                    <Clock size={12} className="text-foreground-muted" />
                    <span>{formatDuration(clip.startTime, clip.endTime)}</span>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between mb-1.5">
                    <h3 className="text-foreground-default font-bold text-base truncate flex-1 pr-3 leading-tight">
                      Clip {clip.id.split("_")[1]}
                    </h3>
                    <div className="flex space-x-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <Button
                        onClick={() => onEditClip(clip)}
                        className="flex items-center justify-center transform hover:scale-105 w-7 h-7 p-1 bg-surface-tertiary hover:bg-surface-hover"
                        variant="default"
                        size="icon"
                        title="Edit Clip"
                      >
                        <Edit size={15} />
                      </Button>
                      <Button
                        onClick={() => {
                          setClipToDelete(clip);
                          openDeleteConfirmModal();
                        }}
                        className="flex items-center justify-center transform hover:scale-105 w-7 h-7 p-1 bg-surface-tertiary hover:bg-surface-hover"
                        variant="destructive"
                        size="icon"
                        title="Delete Clip"
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-foreground-subtle">
                    <div className="flex items-center space-x-1.5">
                      <Calendar size={13} className="text-primary" />
                      <span className="font-medium">
                        {formatTime(clip.markedAt)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Clock size={13} className="text-primary" />
                      <span className="font-medium">
                        {getRelativeTime(clip.markedAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <DeleteConfirmationDialog
        isOpen={isDeleteConfirmModalOpen}
        onOpenChange={closeDeleteConfirmModal}
        onConfirm={handleDeleteConfirm}
        itemName={
          clipToDelete ? `clip ${clipToDelete.id.split("_")[1]}` : "this clip"
        }
      />
    </div>
  );
}
