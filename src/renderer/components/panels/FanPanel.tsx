import React from 'react';
import { Card, CardContent } from '../elements/card';
import { ThinkfanFan } from '../../../types/thinkfan';

interface FanPanelProps {
  fans: ThinkfanFan[];
}

export function FanPanel({ fans }: FanPanelProps) {
  return (
    <Card>
      <CardContent className="mt-4">
        <div className="space-y-4">
          {fans.map((fan, index) => (
            <div key={index} className="p-4 border rounded-lg">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium">Fan {index + 1}</h3>
                  <p className="text-sm text-gray-500">
                    Path: {fan.tpacpi || fan.hwmon || fan.path || 'Unknown'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">
                    Type: {fan.type || (fan.tpacpi ? 'TPACPI' : 'HWMON')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
} 