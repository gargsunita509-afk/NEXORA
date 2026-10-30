import React from 'react';
import {
  TimetableVersion,
  getActiveTimetableVersion,
  getActiveClassInCharge,
} from '../data/initialTimetable';
import { StreamType } from '../types';

export interface PrintableTimetableProps {
  version?: TimetableVersion;
}

export const PrintableTimetable: React.FC<PrintableTimetableProps> = ({ version }) => {
  const activeVersion: TimetableVersion = version || getActiveTimetableVersion();
  const isOld = activeVersion === 'old';
  const activeInCharge = getActiveClassInCharge(activeVersion);

  const printDate = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const streams: { id: StreamType; name: string }[] = [
    { id: 'PCM', name: 'PCM (Science)' },
    { id: 'PCB', name: 'PCB (Medical)' },
    { id: 'COMMERCE', name: 'Commerce' },
    { id: 'HUMANITIES', name: 'Humanities (Arts)' },
  ];

  return (
    <div
      id="nexora-printable-timetable"
      className="hidden print:block text-slate-900 bg-white font-sans text-xs w-full max-w-full m-0 p-0"
    >
      {/* Official Master Header */}
      <div className="border-b-2 border-slate-900 pb-1 mb-1.5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900 font-hud uppercase">
              THE ABHINAV SCHOOL — CLASS 11TH OFFICIAL TIMETABLE
            </h1>
            <div className="flex items-center gap-2.5 text-[10.5px] font-semibold text-slate-700 mt-0.5">
              <span>
                Class In-Charge: <strong>{activeInCharge}</strong>
              </span>
              <span>•</span>
              <span>
                Academic Session: <strong>2026–2027</strong>
              </span>
              <span>•</span>
              <span>
                Schedule: <strong>Monday to Saturday</strong>
              </span>
            </div>
          </div>
          <div className="text-right text-[10px] text-slate-600">
            <span className="font-bold text-slate-800">
              {isOld ? 'OLD TIMETABLE' : 'CURRENT TIMETABLE'}
            </span>
            <div>Printed: {printDate}</div>
          </div>
        </div>
      </div>

      {/* Master Weekly Matrix Table */}
      <table className="w-full border-collapse border border-slate-800 text-[10px] leading-tight">
        <thead>
          <tr className="bg-slate-200 border-b border-slate-800 text-slate-900 font-bold uppercase">
            <th className="py-1 px-2 border-r border-slate-800 w-[17%] text-left">
              Lecture &amp; Timing
            </th>
            {streams.map((s) => (
              <th
                key={s.id}
                className="py-1 px-2 border-r last:border-r-0 border-slate-800 text-center w-[20.75%]"
              >
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* 1. SCHOOL ENTRY TIME */}
          <tr className="border-b border-slate-700">
            <td className="py-1 px-2 border-r border-slate-800 font-bold bg-slate-100">
              <div>School Entry Time</div>
              <div className="text-[9.5px] text-slate-600 font-mono">7:30 AM – 8:00 AM</div>
            </td>
            <td
              colSpan={4}
              className="py-1 px-2 text-center bg-slate-50 font-semibold text-slate-800"
            >
              Campus Gates Open, Student Entry, Arrival Verification &amp; Settling In (All Streams)
            </td>
          </tr>

          {/* 2. MORNING PRAYER */}
          <tr className="border-b border-slate-700">
            <td className="py-1 px-2 border-r border-slate-800 font-bold bg-slate-100">
              <div>Morning Prayer</div>
              <div className="text-[9.5px] text-slate-600 font-mono">8:00 AM – 8:20 AM</div>
            </td>
            <td
              colSpan={4}
              className="py-1 px-2 text-center bg-slate-50 font-semibold text-slate-800"
            >
              Morning Assembly, School Prayer, Pledge, Thought for the Day &amp; National Anthem (All Streams)
            </td>
          </tr>

          {/* ZERO LECTURE */}
          <tr className="border-b border-slate-700">
            <td className="py-1 px-2 border-r border-slate-800 font-bold bg-slate-100">
              <div>Zero Lecture</div>
              <div className="text-[9.5px] text-slate-600 font-mono">8:20 AM – 8:30 AM</div>
            </td>
            <td
              colSpan={4}
              className="py-1 px-2 text-center bg-slate-50 font-semibold text-slate-800"
            >
              Class Meeting, Attendance &amp; Morning Announcements — {activeInCharge} (All Streams)
            </td>
          </tr>

          {isOld ? (
            <>
              {/* OLD TIMETABLE: FIRST LECTURE — TWO DAY-GROUP MATRIX */}
              <tr className="border-b border-slate-700">
                <td className="py-1 px-2 border-r border-slate-800 font-bold bg-slate-100">
                  <div>First Lecture</div>
                  <div className="text-[9.5px] text-slate-600 font-mono">8:30 AM – 9:10 AM</div>
                  <div className="text-[8.5px] text-slate-500 font-semibold uppercase mt-0.5">
                    Two Day-Group Matrix
                  </div>
                </td>
                <td colSpan={4} className="p-0 border-r-0">
                  <div className="grid grid-cols-2 divide-x divide-slate-800">
                    <div className="p-1 bg-white">
                      <div className="font-bold text-[9.5px] text-slate-900 uppercase bg-slate-100 px-1 py-0.5 mb-0.5 rounded border border-slate-300">
                        Monday to Wednesday
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-[10px]">
                        <div>
                          <span className="font-semibold text-slate-800">PCM/PCB: </span>
                          Physics (Diksha Mam)
                        </div>
                        <div>
                          <span className="font-semibold text-slate-800">Hum/Comm: </span>
                          Economics (Alka Mam)
                        </div>
                      </div>
                    </div>
                    <div className="p-1 bg-slate-50/50">
                      <div className="font-bold text-[9.5px] text-slate-900 uppercase bg-slate-100 px-1 py-0.5 mb-0.5 rounded border border-slate-300">
                        Thursday to Saturday
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-[10px]">
                        <div>
                          <span className="font-semibold text-slate-800">PCM/PCB: </span>
                          Free Period
                        </div>
                        <div>
                          <span className="font-semibold text-slate-800">Hum/Comm: </span>
                          Economics (Alka Mam)
                        </div>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>

              {/* OLD TIMETABLE: SECOND LECTURE */}
              <tr className="border-b border-slate-700">
                <td className="py-1 px-2 border-r border-slate-800 font-bold bg-slate-100">
                  <div>Second Lecture</div>
                  <div className="text-[9.5px] text-slate-600 font-mono">9:10 AM – 9:50 AM</div>
                </td>
                {streams.map((s) => (
                  <td key={s.id} className="py-1 px-2 border-r last:border-r-0 border-slate-800 text-center">
                    <div className="font-bold text-slate-900">English</div>
                    <div className="text-[9.5px] text-slate-600">Teacher: Nancy Mam</div>
                  </td>
                ))}
              </tr>

              {/* FRUIT BREAK */}
              <tr className="border-b border-slate-700 bg-amber-50/80">
                <td className="py-0.5 px-2 border-r border-slate-800 font-bold text-slate-800">
                  <span className="text-[9.5px] font-mono">9:50 AM – 10:00 AM</span>
                </td>
                <td
                  colSpan={4}
                  className="py-0.5 px-2 text-center font-bold text-slate-800 uppercase tracking-wider text-[10px]"
                >
                  — Fruit Break (Nutrition &amp; Classroom Relaxation) —
                </td>
              </tr>

              {/* OLD TIMETABLE: THIRD LECTURE */}
              <tr className="border-b border-slate-700">
                <td className="py-1 px-2 border-r border-slate-800 font-bold bg-slate-100">
                  <div>Third Lecture</div>
                  <div className="text-[9.5px] text-slate-600 font-mono">10:00 AM – 10:40 AM</div>
                </td>
                {/* PCM */}
                <td className="py-1 px-2 border-r border-slate-800 text-center">
                  <div className="font-bold text-slate-900">Mathematics</div>
                  <div className="text-[9.5px] text-slate-600">Teacher: Anita Mam</div>
                </td>
                {/* PCB */}
                <td className="py-1 px-2 border-r border-slate-800 text-center">
                  <div className="font-bold text-slate-900">Biology</div>
                  <div className="text-[9.5px] text-slate-600">Teacher: Shalini Mam</div>
                </td>
                {/* COMMERCE */}
                <td className="py-1 px-2 border-r border-slate-800 text-center bg-slate-50">
                  <div className="font-bold text-slate-700">Free</div>
                </td>
                {/* HUMANITIES */}
                <td className="py-1 px-2 border-slate-800 text-center bg-slate-50">
                  <div className="font-bold text-slate-700">Free</div>
                </td>
              </tr>

              {/* OLD TIMETABLE: FOURTH LECTURE */}
              <tr className="border-b border-slate-700">
                <td className="py-1 px-2 border-r border-slate-800 font-bold bg-slate-100">
                  <div>Fourth Lecture</div>
                  <div className="text-[9.5px] text-slate-600 font-mono">10:40 AM – 11:20 AM</div>
                </td>
                {/* PCM */}
                <td className="py-1 px-2 border-r border-slate-800 text-center">
                  <div className="font-bold text-slate-900">Physics</div>
                  <div className="text-[9.5px] text-slate-600">Teacher: Diksha Mam</div>
                </td>
                {/* PCB */}
                <td className="py-1 px-2 border-r border-slate-800 text-center">
                  <div className="font-bold text-slate-900">Physics</div>
                  <div className="text-[9.5px] text-slate-600">Teacher: Diksha Mam</div>
                </td>
                {/* COMMERCE */}
                <td className="py-1 px-2 border-r border-slate-800 text-center">
                  <div className="font-bold text-slate-900">Business Studies</div>
                  <div className="text-[9.5px] text-slate-600">Teacher: Alka Mam</div>
                </td>
                {/* HUMANITIES */}
                <td className="py-1 px-2 border-slate-800 text-center">
                  <div className="font-bold text-slate-900">Political Science / History</div>
                  <div className="text-[9.5px] text-slate-600">Teacher: Ritu Mam</div>
                </td>
              </tr>

              {/* LUNCH BREAK */}
              <tr className="border-b border-slate-700 bg-amber-50/80">
                <td className="py-0.5 px-2 border-r border-slate-800 font-bold text-slate-800">
                  <span className="text-[9.5px] font-mono">11:20 AM – 11:45 AM</span>
                </td>
                <td
                  colSpan={4}
                  className="py-0.5 px-2 text-center font-bold text-slate-800 uppercase tracking-wider text-[10px]"
                >
                  — Lunch Break (Cafeteria &amp; Recess) —
                </td>
              </tr>

              {/* OLD TIMETABLE: FIFTH LECTURE */}
              <tr className="border-b border-slate-700">
                <td className="py-1 px-2 border-r border-slate-800 font-bold bg-slate-100">
                  <div>Fifth Lecture</div>
                  <div className="text-[9.5px] text-slate-600 font-mono">11:45 AM – 12:25 PM</div>
                  <div className="text-[8.5px] text-slate-500 font-semibold uppercase mt-0.5">
                    Two Day-Group Matrix
                  </div>
                </td>
                <td colSpan={4} className="p-0 border-r-0">
                  <div className="grid grid-cols-2 divide-x divide-slate-800">
                    <div className="p-1 bg-white text-center">
                      <div className="font-bold text-[9.5px] text-slate-900 uppercase bg-slate-100 px-1 py-0.5 mb-0.5 rounded border border-slate-300">
                        Monday to Wednesday (Common Scheduled Option)
                      </div>
                      <div className="font-bold text-[10.5px] text-slate-900">
                        Physical Education (PE) &amp; AI
                      </div>
                      <div className="text-[9px] text-slate-600 italic">
                        Subjects chosen by students according to their individual choice.
                      </div>
                    </div>
                    <div className="p-1 bg-slate-50/50 text-center">
                      <div className="font-bold text-[9.5px] text-slate-900 uppercase bg-slate-100 px-1 py-0.5 mb-0.5 rounded border border-slate-300">
                        Thursday to Saturday (Common Scheduled Option)
                      </div>
                      <div className="font-bold text-[10.5px] text-slate-900">
                        Fine Arts &amp; AI
                      </div>
                      <div className="text-[9px] text-slate-600 italic">
                        Subjects chosen by students according to their individual choice.
                      </div>
                    </div>
                  </div>
                </td>
              </tr>

              {/* OLD TIMETABLE: SIXTH LECTURE */}
              <tr className="border-b border-slate-700">
                <td className="py-1 px-2 border-r border-slate-800 font-bold bg-slate-100">
                  <div>Sixth Lecture</div>
                  <div className="text-[9.5px] text-slate-600 font-mono">12:25 PM – 1:05 PM</div>
                </td>
                {/* PCM */}
                <td className="py-1 px-2 border-r border-slate-800 text-center">
                  <div className="font-bold text-slate-900">Chemistry</div>
                  <div className="text-[9.5px] text-slate-600">Teacher: Harshu Mam</div>
                </td>
                {/* PCB */}
                <td className="py-1 px-2 border-r border-slate-800 text-center">
                  <div className="font-bold text-slate-900">Chemistry</div>
                  <div className="text-[9.5px] text-slate-600">Teacher: Harshu Mam</div>
                </td>
                {/* COMMERCE */}
                <td className="py-1 px-2 border-r border-slate-800 text-center">
                  <div className="font-bold text-slate-900">Accounts</div>
                  <div className="text-[9.5px] text-slate-600">Teacher: Alka Mam</div>
                </td>
                {/* HUMANITIES */}
                <td className="py-1 px-2 border-slate-800 text-center bg-slate-50">
                  <div className="font-bold text-slate-700">Free</div>
                </td>
              </tr>
            </>
          ) : (
            <>
              {/* CURRENT TIMETABLE: FIRST LECTURE */}
              <tr className="border-b border-slate-700">
                <td className="py-1 px-2 border-r border-slate-800 font-bold bg-slate-100">
                  <div>First Lecture</div>
                  <div className="text-[9.5px] text-slate-600 font-mono">8:30 AM – 9:10 AM</div>
                </td>
                {/* PCM */}
                <td className="py-1 px-2 border-r border-slate-800 text-center">
                  <div className="font-bold text-slate-900">Physics</div>
                  <div className="text-[9.5px] text-slate-600">Teacher: Diksha Mam</div>
                </td>
                {/* PCB */}
                <td className="py-1 px-2 border-r border-slate-800 text-center">
                  <div className="font-bold text-slate-900">Physics</div>
                  <div className="text-[9.5px] text-slate-600">Teacher: Diksha Mam</div>
                </td>
                {/* COMMERCE */}
                <td className="py-1 px-2 border-r border-slate-800 text-center">
                  <div className="font-bold text-slate-900">Business Studies</div>
                  <div className="text-[9.5px] text-slate-600">Teacher: Parul Mam</div>
                </td>
                {/* HUMANITIES */}
                <td className="py-1 px-2 border-slate-800 text-center bg-slate-50">
                  <div className="font-bold text-slate-700">Free</div>
                </td>
              </tr>

              {/* CURRENT TIMETABLE: SECOND LECTURE */}
              <tr className="border-b border-slate-700">
                <td className="py-1 px-2 border-r border-slate-800 font-bold bg-slate-100">
                  <div>Second Lecture</div>
                  <div className="text-[9.5px] text-slate-600 font-mono">9:10 AM – 9:50 AM</div>
                </td>
                {streams.map((s) => (
                  <td key={s.id} className="py-1 px-2 border-r last:border-r-0 border-slate-800 text-center">
                    <div className="font-bold text-slate-900">English</div>
                    <div className="text-[9.5px] text-slate-600">Teacher: Nancy Mam</div>
                  </td>
                ))}
              </tr>

              {/* FRUIT BREAK */}
              <tr className="border-b border-slate-700 bg-amber-50/80">
                <td className="py-0.5 px-2 border-r border-slate-800 font-bold text-slate-800">
                  <span className="text-[9.5px] font-mono">9:50 AM – 10:00 AM</span>
                </td>
                <td
                  colSpan={4}
                  className="py-0.5 px-2 text-center font-bold text-slate-800 uppercase tracking-wider text-[10px]"
                >
                  — Fruit Break (Nutrition &amp; Classroom Relaxation) —
                </td>
              </tr>

              {/* CURRENT TIMETABLE: THIRD LECTURE */}
              <tr className="border-b border-slate-700">
                <td className="py-1 px-2 border-r border-slate-800 font-bold bg-slate-100">
                  <div>Third Lecture</div>
                  <div className="text-[9.5px] text-slate-600 font-mono">10:00 AM – 10:40 AM</div>
                </td>
                {/* PCM */}
                <td className="py-1 px-2 border-r border-slate-800 text-center">
                  <div className="font-bold text-slate-900">Chemistry</div>
                  <div className="text-[9.5px] text-slate-600">Teacher: Harshu Mam</div>
                </td>
                {/* PCB */}
                <td className="py-1 px-2 border-r border-slate-800 text-center">
                  <div className="font-bold text-slate-900">Chemistry</div>
                  <div className="text-[9.5px] text-slate-600">Teacher: Harshu Mam</div>
                </td>
                {/* COMMERCE */}
                <td className="py-1 px-2 border-r border-slate-800 text-center">
                  <div className="font-bold text-slate-900">Accountancy</div>
                  <div className="text-[9.5px] text-slate-600">Teacher: Alka Mam</div>
                </td>
                {/* HUMANITIES */}
                <td className="py-1 px-2 border-slate-800 text-center">
                  <div className="font-bold text-slate-900">
                    Political Science (Mon–Wed) / History (Thu–Sat)
                  </div>
                  <div className="text-[9.5px] text-slate-600">Teacher: Ritu Mam</div>
                </td>
              </tr>

              {/* CURRENT TIMETABLE: FOURTH LECTURE */}
              <tr className="border-b border-slate-700">
                <td className="py-1 px-2 border-r border-slate-800 font-bold bg-slate-100">
                  <div>Fourth Lecture</div>
                  <div className="text-[9.5px] text-slate-600 font-mono">10:40 AM – 11:20 AM</div>
                </td>
                {/* PCM */}
                <td className="py-1 px-2 border-r border-slate-800 text-center">
                  <div className="font-bold text-slate-900">Mathematics</div>
                  <div className="text-[9.5px] text-slate-600">Teacher: Anita Mam</div>
                </td>
                {/* PCB */}
                <td className="py-1 px-2 border-r border-slate-800 text-center">
                  <div className="font-bold text-slate-900">Biology</div>
                  <div className="text-[9.5px] text-slate-600">Teacher: Shalini Mam</div>
                </td>
                {/* COMMERCE */}
                <td className="py-1 px-2 border-r border-slate-800 text-center bg-slate-50">
                  <div className="font-bold text-slate-700">Free</div>
                </td>
                {/* HUMANITIES */}
                <td className="py-1 px-2 border-slate-800 text-center bg-slate-50">
                  <div className="font-bold text-slate-700">Free</div>
                </td>
              </tr>

              {/* LUNCH BREAK */}
              <tr className="border-b border-slate-700 bg-amber-50/80">
                <td className="py-0.5 px-2 border-r border-slate-800 font-bold text-slate-800">
                  <span className="text-[9.5px] font-mono">11:20 AM – 11:45 AM</span>
                </td>
                <td
                  colSpan={4}
                  className="py-0.5 px-2 text-center font-bold text-slate-800 uppercase tracking-wider text-[10px]"
                >
                  — Lunch Break (Cafeteria &amp; Recess) —
                </td>
              </tr>

              {/* CURRENT TIMETABLE: FIFTH LECTURE */}
              <tr className="border-b border-slate-700">
                <td className="py-1 px-2 border-r border-slate-800 font-bold bg-slate-100">
                  <div>Fifth Lecture</div>
                  <div className="text-[9.5px] text-slate-600 font-mono">11:45 AM – 12:25 PM</div>
                </td>
                {/* PCM */}
                <td className="py-1 px-2 border-r border-slate-800 text-center">
                  <div className="font-bold text-slate-900">
                    Physics (Mon–Wed) / Chemistry (Thu–Sat)
                  </div>
                </td>
                {/* PCB */}
                <td className="py-1 px-2 border-r border-slate-800 text-center">
                  <div className="font-bold text-slate-900">
                    Physics (Mon–Wed) / Chemistry (Thu–Sat)
                  </div>
                </td>
                {/* COMMERCE */}
                <td className="py-1 px-2 border-r border-slate-800 text-center">
                  <div className="font-bold text-slate-900">Economics</div>
                  <div className="text-[9.5px] text-slate-600">Teacher: Alka Mam</div>
                </td>
                {/* HUMANITIES */}
                <td className="py-1 px-2 border-slate-800 text-center">
                  <div className="font-bold text-slate-900">Economics</div>
                  <div className="text-[9.5px] text-slate-600">Teacher: Alka Mam</div>
                </td>
              </tr>

              {/* CURRENT TIMETABLE: SIXTH LECTURE */}
              <tr className="border-b border-slate-700">
                <td className="py-1 px-2 border-r border-slate-800 font-bold bg-slate-100">
                  <div>Sixth Lecture</div>
                  <div className="text-[9.5px] text-slate-600 font-mono">12:25 PM – 1:05 PM</div>
                </td>
                {streams.map((s) => (
                  <td
                    key={s.id}
                    className="py-1 px-2 border-r last:border-r-0 border-slate-800 text-center"
                  >
                    <div className="font-bold text-slate-900">
                      Physical Education (Mon–Wed) / Fine Arts (Thu–Sat)
                    </div>
                  </td>
                ))}
              </tr>
            </>
          )}

          {/* AFTER-SCHOOL WAITING PERIOD — 1:05 PM to 2:00 PM */}
          <tr className="bg-slate-100/90 font-semibold text-slate-900">
            <td className="py-1 px-2 border-r border-slate-800 font-bold bg-slate-200">
              <div className="text-[10px] font-bold">School Off / Dispersal</div>
              <div className="text-[9.5px] text-slate-700 font-mono">1:05 PM – 2:00 PM</div>
            </td>
            <td colSpan={4} className="py-1 px-2.5 border-slate-800 text-left">
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-bold text-slate-900 text-[11px]">
                  School Off / Dispersal &amp; Waiting Period
                </span>
                <span className="px-1.5 py-0.5 rounded border border-slate-400 bg-white text-[9px] font-bold uppercase">
                  Status: All regular classes finished (1:05 PM)
                </span>
              </div>
              <p className="text-[9.5px] text-slate-700 font-normal">
                Students are free from classes and may wait for their school bus/van, siblings, or parents until departure.
                (After-school waiting period extends to 2:00 PM; not a lecture).
              </p>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Institutional Info Footer (No approval/verification statements) */}
      <div className="mt-1.5 pt-1 border-t border-slate-400 flex items-center justify-between text-[9.5px] text-slate-600">
        <div>
          <span className="font-bold text-slate-800">THE ABHINAV SCHOOL</span>
          <span className="mx-1.5">•</span>
          <span>NEXORA Class 11 Command Center</span>
          <span className="mx-1.5">•</span>
          <span>Official Institutional Matrix (Permanently Read-Only)</span>
        </div>
        <div>
          <span>Class 11th ({isOld ? 'Old Timetable' : 'Current Timetable'})</span>
        </div>
      </div>

      {/* Timetable Disclaimer Note at Absolute Bottom of Print Sheet */}
      <div className="mt-1 text-center text-[9px] text-slate-600 font-sans leading-tight bg-transparent border-0 p-0">
        Note: This timetable is for regular school days. In case of any school function, special event, or other activities, the timetable may vary for that day or for a few days.
      </div>
    </div>
  );
};

