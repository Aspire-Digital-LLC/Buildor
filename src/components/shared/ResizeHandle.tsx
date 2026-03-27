import { useCallback, useRef } from 'react';

interface ResizeHandleProps {
  onResize: (delta: number) => void;
  direction?: 'horizontal' | 'vertical';
}

export function ResizeHandle({ onResize, direction = 'horizontal' }: ResizeHandleProps) {
  const dragging = useRef(false);
  const lastPos = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    lastPos.current = direction === 'horizontal' ? e.clientX : e.clientY;

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const current = direction === 'horizontal' ? ev.clientX : ev.clientY;
      const delta = current - lastPos.current;
      lastPos.current = current;
      onResize(delta);
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [onResize, direction]);

  const isHoriz = direction === 'horizontal';

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        width: isHoriz ? 5 : '100%',
        height: isHoriz ? '100%' : 5,
        cursor: isHoriz ? 'col-resize' : 'row-resize',
        flexShrink: 0,
        position: 'relative',
        zIndex: 1,
      }}
    >
      {/* Visible line */}
      <div style={{
        position: 'absolute',
        [isHoriz ? 'left' : 'top']: 2,
        [isHoriz ? 'width' : 'height']: 1,
        [isHoriz ? 'height' : 'width']: '100%',
        background: 'var(--border-primary)',
        transition: 'background 0.15s',
      }} />
    </div>
  );
}
