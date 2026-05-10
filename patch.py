import sys

with open('static/js/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_metrics = """  statEl.innerHTML = `
    <div class="overview-metric">Total Applications<strong>${total}</strong></div>
    <div class="overview-metric">Applied<strong>${applied}</strong></div>
    <div class="overview-metric">Interview<strong>${interview}</strong></div>
    <div class="overview-metric">Offers<strong>${offer}</strong></div>
  `;"""

new_metrics = """  statEl.innerHTML = `
    <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center text-center">
      <span class="text-slate-400 text-sm uppercase tracking-wider mb-1">Total</span>
      <strong class="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-electricBlue to-blue-400">${total}</strong>
    </div>
    <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center text-center">
      <span class="text-slate-400 text-sm uppercase tracking-wider mb-1">Applied</span>
      <strong class="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">${applied}</strong>
    </div>
    <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center text-center">
      <span class="text-slate-400 text-sm uppercase tracking-wider mb-1">Interview</span>
      <strong class="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">${interview}</strong>
    </div>
    <div class="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center text-center">
      <span class="text-slate-400 text-sm uppercase tracking-wider mb-1">Offers</span>
      <strong class="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-energeticOrange to-yellow-400">${offer}</strong>
    </div>
  `;"""

old_source_viz = """    return `
      <div class="source-row">
        <span class="source-name">${escapeHtml(source)}</span>
        <div class="source-bar-track">
          <div class="source-bar-fill" style="width:${width}%"></div>
        </div>
        <span class="source-value">${value}</span>
      </div>
    `;"""

new_source_viz = """    return `
      <div class="flex items-center gap-4 group mb-3">
        <span class="w-24 truncate text-slate-300 text-sm font-medium" title="${escapeHtml(source)}">${escapeHtml(source)}</span>
        <div class="flex-1 h-3 bg-white/10 rounded-full overflow-hidden">
          <div class="h-full bg-gradient-to-r from-electricBlue to-energeticOrange rounded-full transition-all duration-1000 ease-out group-hover:opacity-80" style="width:${width}%"></div>
        </div>
        <span class="w-8 text-right font-bold text-white">${value}</span>
      </div>
    `;"""

old_empty_source = """  if (!entries.length) {
    vizEl.innerHTML = '<div class="overview-metric">No application data yet. Add your first tracked job to see source insights.</div>';
    return;
  }"""

new_empty_source = """  if (!entries.length) {
    vizEl.innerHTML = '<div class="text-slate-400 p-4 bg-white/5 border border-white/10 rounded-xl text-center">No application data yet. Add your first tracked job to see source insights.</div>';
    return;
  }"""

old_error_metrics = """  } catch (error) {
    statEl.innerHTML = '<div class="overview-metric">Tracker metrics unavailable right now.</div>';
    const vizEl = getHomeEl('homeSourceViz');
    if (vizEl) {
      vizEl.innerHTML = '<div class="overview-metric">Could not load source distribution.</div>';
    }
  }"""

new_error_metrics = """  } catch (error) {
    statEl.innerHTML = '<div class="col-span-2 text-center text-slate-400 p-4 bg-white/5 border border-white/10 rounded-xl">Tracker metrics unavailable right now.</div>';
    const vizEl = getHomeEl('homeSourceViz');
    if (vizEl) {
      vizEl.innerHTML = '<div class="text-center text-slate-400 p-4 bg-white/5 border border-white/10 rounded-xl">Could not load source distribution.</div>';
    }
  }"""

content = content.replace(old_metrics, new_metrics)
content = content.replace(old_source_viz, new_source_viz)
content = content.replace(old_empty_source, new_empty_source)
content = content.replace(old_error_metrics, new_error_metrics)

if old_metrics.replace('\n', '\r\n') in content:
    content = content.replace(old_metrics.replace('\n', '\r\n'), new_metrics)
    content = content.replace(old_source_viz.replace('\n', '\r\n'), new_source_viz)
    content = content.replace(old_empty_source.replace('\n', '\r\n'), new_empty_source)
    content = content.replace(old_error_metrics.replace('\n', '\r\n'), new_error_metrics)

with open('static/js/main.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Updated main.js successfully.')
