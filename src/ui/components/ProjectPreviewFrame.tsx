import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";

type AspectFitSize = {
  width: number | "auto";
  height: number | "auto";
};

type ContainerSize = {
  width: number;
  height: number;
};

function useAspectFitSize(projectWidth: number, projectHeight: number): {
  containerRef: RefObject<HTMLDivElement>;
  fitSize: AspectFitSize;
  aspectRatio: string;
} {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<ContainerSize>({ width: 0, height: 0 });
  const aspectRatio = `${projectWidth} / ${projectHeight}`;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      setContainerSize({
        width: Math.max(0, entry.contentRect.width),
        height: Math.max(0, entry.contentRect.height),
      });
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const fitSize = useMemo(() => {
    if (projectWidth <= 0 || projectHeight <= 0 || containerSize.width <= 0 || containerSize.height <= 0) {
      return { width: 0, height: 0 };
    }

    const projectAspectRatio = projectWidth / projectHeight;
    const containerAspectRatio = containerSize.width / containerSize.height;

    if (containerAspectRatio > projectAspectRatio) {
      return { width: "auto" as const, height: Math.max(1, containerSize.height) };
    }

    return { width: Math.max(1, containerSize.width), height: "auto" as const };
  }, [containerSize.height, containerSize.width, projectHeight, projectWidth]);

  return { containerRef, fitSize, aspectRatio };
}

type ProjectPreviewFrameProps = {
  children: ReactNode;
  className?: string;
  projectHeight: number;
  projectWidth: number;
};

export function ProjectPreviewFrame({
  children,
  className = "",
  projectHeight,
  projectWidth,
}: ProjectPreviewFrameProps) {
  const { aspectRatio, containerRef, fitSize } = useAspectFitSize(projectWidth, projectHeight);
  const shellClassName = ["project-preview-shell", className].filter(Boolean).join(" ");

  return (
    <div className={shellClassName} ref={containerRef}>
      <div
        className="project-preview-frame"
        style={
          {
            "--project-aspect-ratio": aspectRatio,
            aspectRatio,
            height: fitSize.height,
            width: fitSize.width,
          } as CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}
