import React from 'react';
import { motion } from 'framer-motion';
import { ButtonDef, Rect } from '../lib/constants';

interface InteractionSystemProps {
  buttons: ButtonDef[];
  buttonRects: Rect[];
  draggingIndex: number | null;
  scalingIndex: number | null;
}

const InteractionSystem: React.FC<InteractionSystemProps> = ({
  buttons,
  buttonRects,
  draggingIndex,
  scalingIndex,
}) => {
  return (
    <>
      {buttons.map(({ label, color, icon }, i) => {
        const r = buttonRects[i];
        if (!r) return null;

        const isDragging = draggingIndex === i;
        const isScaling = scalingIndex === i;

        return (
          <motion.div
            key={i}
            className={`btn-card ${isDragging || isScaling ? 'dragging' : ''}`}
            initial={false}
            animate={{
              left: r.x,
              top: r.y,
              width: r.w,
              height: r.h,
              scale: isDragging ? 1.05 : 1,
              rotate: isDragging ? -1.5 : 0,
            }}
            transition={{
              type: 'spring',
              stiffness: isDragging ? 1000 : 300,
              damping: isDragging ? 50 : 30,
              mass: 0.5,
            }}
            style={{
              position: 'fixed',
              color,
              borderColor: color,
              fontSize: Math.max(12, Math.min(28, r.h * 0.3)),
              boxShadow: isScaling
                ? `0 0 80px ${color}dd, 0 0 30px ${color}99, inset 0 0 30px ${color}33`
                : isDragging
                ? `0 0 60px ${color}bb, 0 0 20px ${color}66, inset 0 0 20px ${color}22`
                : `0 0 12px ${color}44`,
              zIndex: isDragging || isScaling ? 25 : 20,
            }}
          >
            <span style={{ opacity: 0.7, fontSize: Math.max(10, r.h * 0.22) }}>{icon}</span>
            {label}
            
            {isDragging && (
              <motion.div
                className="ripple"
                initial={{ scale: 0, opacity: 0.7 }}
                animate={{ scale: 4, opacity: 0 }}
                transition={{ duration: 0.5, repeat: Infinity }}
                style={{ color }}
              />
            )}
          </motion.div>
        );
      })}
    </>
  );
};

export default InteractionSystem;
