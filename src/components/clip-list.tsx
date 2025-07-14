import { useState, useMemo } from "react";
import { Play, Edit, Trash2, RefreshCw, Clock, Calendar } from "lucide-react";
import { ClipMarker } from "@/types/app";

interface ClipListProps {
  clips: ClipMarker[];
  onEditClip: (clip: ClipMarker) => void;
  onRefresh: () => Promise<void>;
}

export default function ClipList({
  clips,
  onEditClip,
  onRefresh,
}: ClipListProps) {
  const [sortBy, setSortBy] = useState<string>("newest");
  const [filterText, setFilterText] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

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

  return (
    <div className="space-y-8 p-6 bg-gradient-to-br from-gray-900 to-gray-950 min-h-screen text-white font-sans">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-extrabold text-white tracking-tight">
          Recorded Clips
        </h2>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg shadow-md hover:from-purple-700 hover:to-purple-800 transition-all duration-300 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-2.5 transform hover:-translate-y-0.5"
        >
          <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
          <span className="text-lg font-medium">Refresh</span>
        </button>
      </div>

      <div className="bg-gray-800 rounded-xl shadow-2xl p-6 border border-gray-700">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-5 md:space-y-0 md:space-x-5">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Filter clips..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-3 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200"
            />
          </div>

          <div className="flex items-center space-x-3">
            <label className="text-base font-medium text-gray-300">
              Sort by:
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white appearance-none focus:outline-none focus:ring-3 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="duration">Duration</option>
            </select>
          </div>
        </div>
      </div>

      {sortedAndFilteredClips.length === 0 ? (
        <div className="bg-gray-800 rounded-xl shadow-2xl p-16 text-center border border-gray-700">
          <div className="text-gray-400 text-xl font-semibold mb-4">
            No clips found
          </div>
          <div className="text-gray-500 text-base leading-relaxed">
            {clips.length === 0
              ? "Start recording and press Ctrl+Shift+M to mark interesting moments."
              : "Try adjusting your search filter or refreshing the list."}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-7">
          {sortedAndFilteredClips.map((clip: ClipMarker) => (
            <div
              key={clip.id}
              className="bg-gray-800 rounded-xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 group relative border border-gray-700"
            >
              <div className="aspect-video bg-gray-900 relative flex items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-br from-gray-900/70 to-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <Play
                    size={64}
                    className="text-purple-400 opacity-90 group-hover:scale-110 transition-transform duration-300"
                  />
                </div>
                <div className="absolute top-3 right-3 bg-black bg-opacity-70 text-white text-sm px-3 py-1.5 rounded-lg font-mono flex items-center space-x-1">
                  <Clock size={14} className="text-gray-400" />
                  <span>{formatDuration(clip.startTime, clip.endTime)}</span>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-white font-bold text-lg truncate flex-1 pr-4">
                    Clip {clip.id.split("_")[1]}
                  </h3>
                  <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <button
                      onClick={() => onEditClip(clip)}
                      className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors duration-200 shadow-md flex items-center justify-center transform hover:scale-105"
                      title="Edit Clip"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => {
                        // TODO: Implement delete functionality
                        console.log("Delete clip:", clip.id);
                      }}
                      className="p-2 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors duration-200 shadow-md flex items-center justify-center transform hover:scale-105"
                      title="Delete Clip"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-sm text-gray-400">
                  <div className="flex items-center space-x-2">
                    <Calendar size={16} className="text-purple-400" />
                    <span className="font-medium">
                      {formatTime(clip.markedAt)}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock size={16} className="text-purple-400" />
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
  );
}
