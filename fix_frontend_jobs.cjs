const fs = require('fs');

let jobMgt = fs.readFileSync('src/features/jobs/JobManagement.tsx', 'utf8');

const missingFields = `              <div className="xl:col-span-8 space-y-6">
                <div className="bg-muted/30 p-6 rounded-2xl border border-border space-y-6">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">General Configuration</h4>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Job Title</label>
                      <input
                        required
                        value={formData.title}
                        onChange={e => setFormData({...formData, title: e.target.value})}
                        className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        placeholder="e.g. Senior Developer"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Hourly Rate ($)</label>
                        <input
                          required
                          type="number"
                          step="0.01"
                          value={formData.hourly_rate}
                          onChange={e => setFormData({...formData, hourly_rate: e.target.value})}
                          className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Weekly Hours</label>
                        <input
                          required
                          type="number"
                          value={formData.required_hours_per_week}
                          onChange={e => setFormData({...formData, required_hours_per_week: e.target.value})}
                          className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Grace Period (min)</label>
                        <input
                          required
                          type="number"
                          value={formData.grace_period}
                          onChange={e => setFormData({...formData, grace_period: e.target.value})}
                          className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>`;

jobMgt = jobMgt.replace(/            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">\r?\n              \{\/\* Basic Config \*\/\}\r?\n              <div className="xl:col-span-4 space-y-6">/,
`            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
              {/* Basic Config */}
${missingFields}
              <div className="xl:col-span-4 space-y-6">`);

fs.writeFileSync('src/features/jobs/JobManagement.tsx', jobMgt);
