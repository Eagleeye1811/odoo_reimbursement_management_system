import React from 'react';

export const SkeletonRow = ({ cols = 5, height = 16 }) => {
  return (
    <tr className="border-b border-gray-100">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="p-4 align-middle">
          <div 
            className="bg-gray-200 rounded animate-pulse" 
            style={{ 
              height: `${height}px`, 
              width: i === 0 ? '100%' : i === cols - 1 ? '50%' : '80%',
              marginLeft: i === cols - 1 ? 'auto' : '0'
            }} 
          />
        </td>
      ))}
    </tr>
  );
};
