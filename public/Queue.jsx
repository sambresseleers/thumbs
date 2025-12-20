import { useState, useEffect } from "react";

export default function Queue() {
  const [queue, setQueue] = useState([]);
  const [folder, setFolder] = useState("");

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 2000);
    return () => clearInterval(interval);
  }, []);

  function fetchQueue() {
    fetch("/queue").then(res => res.json()).then(setQueue);
  }

  function handleAdd() {
    fetch("/queue/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder }),
    }).then(fetchQueue);
  }

  function handleRemove(id) {
    fetch("/queue/" + id, { method: "DELETE" }).then(fetchQueue);
  }

  return (
    <div>
      <input
        type="text"
        placeholder="/data folder"
        value={folder}
        onChange={e => setFolder(e.target.value)}
        className="w-full p-2 border mb-2"
      />
      <button onClick={handleAdd} className="btn btn-blue mb-4">Add Folder</button>
      <div>
        {queue.map(job => (
          <div key={job.id} className="flex justify-between border p-2 mb-1">
            <span>{job.input}</span>
            <button onClick={() => handleRemove(job.id)} className="btn btn-red">Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}
