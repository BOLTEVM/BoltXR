import React from 'react';
import { motion } from 'framer-motion';
import { ButtonDef, Rect } from '../lib/constants';

interface InteractionSystemProps {
  buttons: ButtonDef[];
  buttonRects: Rect[];
  draggingIndex: number | null;
  scalingIndex: number | null;
  hoveredIndex: number | null;
  /** Mouse / touch fallback for users without hand tracking. */
  onActivate: (index: number) => void;
  disabled?: boolean;
}

const InteractionSystem: React.FC<InteractionSystemProps> = ({
  buttons,
  buttonRects,
  draggingIndex,
  scalingIndex,
  hoveredIndex,
  onActivate,
  disabled = false,
}) => {
  return (
    <>
      {buttons.map(({ label, color, icon }, i) => {
        const r = buttonRects[i];
        if (!r) return null;

        const isDragging = draggingIndex === i;
        const isScaling = scalingIndex === i;
        const isHovered = hoveredIndex === i && !isDragging && !isScaling;

        return (
          <motion.button
            key={label}
            type="button"
            className="btn-card"
            onClick={() => onActivate(i)}
            disabled={disabled}
            initial={false}
            animate={{
              left: r.x,
              top: r.y,
              width: r.w,
              height: r.h,
              scale: isDragging ? 1.05 : isHovered ? 1.04 : 1,
              rotate: isDragging ? -1.5 : 0,
            }}
            transition={{
              type: 'spring',
              stiffness: isDragging || isScaling ? 1000 : 300,
              damping: isDragging || isScaling ? 50 : 30,
              mass: 0.5,
            }}
            style={{
              position: 'fixed',
              pointerEvents: disabled ? 'none' : 'auto',
              color,
              borderColor: color,
              fontSize: Math.max(12, Math.min(28, r.h * 0.3)),
              background: isHovered ? `${color}22` : undefined,
              boxShadow: isScaling
                ? `0 0 80px ${color}dd, 0 0 30px ${color}99, inset 0 0 30px ${color}33`
                : isDragging
                ? `0 0 60px ${color}bb, 0 0 20px ${color}66, inset 0 0 20px ${color}22`
                : isHovered
                ? `0 0 28px ${color}88`
                : `0 0 12px ${color}44`,
              zIndex: isDragging || isScaling ? 25 : 20,
            }}
          >
            <span aria-hidden style={{ opacity: 0.7, fontSize: Math.max(10, r.h * 0.22) }}>{icon}</span>
            {label}

            {isDragging && (
              <motion.span
                className="ripple"
                initial={{ scale: 0, opacity: 0.7 }}
                animate={{ scale: 4, opacity: 0 }}
                transition={{ duration: 0.5, repeat: Infinity }}
                style={{ color }}
              />
            )}
          </motion.button>
        );
      })}
    </>
  );
};

export default InteractionSystem;
