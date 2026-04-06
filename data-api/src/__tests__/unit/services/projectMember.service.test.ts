import { hasMinRole } from "../../../services/projectMember.service";
import type { ProjectRole } from "../../../entities/ProjectMember";

describe("hasMinRole", () => {
  const cases: Array<{ role: ProjectRole; minRole: ProjectRole; expected: boolean }> = [
    { role: "owner",  minRole: "owner",  expected: true  },
    { role: "owner",  minRole: "editor", expected: true  },
    { role: "owner",  minRole: "viewer", expected: true  },
    { role: "editor", minRole: "owner",  expected: false },
    { role: "editor", minRole: "editor", expected: true  },
    { role: "editor", minRole: "viewer", expected: true  },
    { role: "viewer", minRole: "owner",  expected: false },
    { role: "viewer", minRole: "editor", expected: false },
    { role: "viewer", minRole: "viewer", expected: true  },
  ];

  it.each(cases)(
    "$role vs minRole=$minRole → $expected",
    ({ role, minRole, expected }) => {
      expect(hasMinRole(role, minRole)).toBe(expected);
    }
  );
});
