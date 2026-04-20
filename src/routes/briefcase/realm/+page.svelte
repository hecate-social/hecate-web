<script lang="ts">
	// Deep-link route for the realm-synced Briefcase. The same component is
	// rendered inside /briefcase under the "Realm Synced" tab — this route
	// exists so links like hecate://.../briefcase/realm still work.
	import BriefcaseRealm from '$lib/components/BriefcaseRealm.svelte';
</script>

<BriefcaseRealm />
