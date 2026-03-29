import React from 'react';
import clsx from 'clsx';
import { Badge } from '../ui/Badge';
import { format } from 'date-fns';

export const ApprovalChain = ({ steps = [] }) => {
  return (
    <div className="space-y-0">
      {steps.map((step, index) => {
        const isApproved = step.status === 'approved';
        const isRejected = step.status === 'rejected';
        const isPending = step.status === 'pending';
        
        return (
          <div key={index} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div
                className={clsx(
                  "flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
                  isApproved ? "bg-green-500 text-white" :
                  isRejected ? "bg-red-500 text-white" :
                  isPending ? "bg-amber-500 text-white ring-4 ring-amber-100 animate-pulse" :
                  "bg-gray-200 text-gray-500"
                )}
              >
                {step.stepNumber}
              </div>
              {index < steps.length - 1 && (
                <div className="w-px h-full min-h-[2rem] bg-gray-200 my-1"></div>
              )}
            </div>
            <div className="pb-6 flex-1 pt-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{step.approverName}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {step.decidedAt ? format(new Date(step.decidedAt), 'MMM d, yyyy h:mm a') : 'Waiting for decision'}
                  </p>
                </div>
                <Badge status={isApproved ? 'approved' : isRejected ? 'rejected' : isPending ? 'pending' : 'pending'}>
                  {step.status}
                </Badge>
              </div>
              {step.comment && (
                <div className="mt-3 text-sm text-gray-700 bg-gray-50 border border-gray-100 p-3 rounded-lg italic text-left">
                  "{step.comment}"
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
